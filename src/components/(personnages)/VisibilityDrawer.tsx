"use client"

import React, { useState, useEffect } from 'react'
import { Eye, EyeOff, Cloud, Trash2, MousePointer, Lightbulb, ArrowRight, DoorOpen, X, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext'
import type { VisibilityState } from '@/hooks/map/useVisibilityState'

interface VisibilityDrawerProps {
    isOpen: boolean
    onClose: () => void
    vs: VisibilityState
}

type Tab = 'fog' | 'obstacles'

export function VisibilityDrawer({ isOpen, onClose, vs }: VisibilityDrawerProps) {
    const { setDialogOpen } = useDialogVisibility();
    const [activeTab, setActiveTab] = useState<Tab>('fog')

    useEffect(() => {
        setDialogOpen(isOpen);
    }, [isOpen, setDialogOpen]);

    if (!isOpen) return null

    return (
        <div className="fixed right-0 top-0 h-full w-80 bg-[#1a1a1a] border-l border-[#333] z-[99999900] flex flex-col shadow-2xl">
            {/* HEADER */}
            <div className="relative px-6 py-5 border-b border-[#333] bg-gradient-to-br from-[#1a1a1a] via-[#1a1a1a] to-[#252525]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c0a080] to-[#a08060] flex items-center justify-center shadow-lg shadow-[#c0a080]/20">
                            <Eye className="w-5 h-5 text-black" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">Visibilit&eacute;</h2>
                            <p className="text-xs text-gray-400">Brouillard & Obstacles</p>
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

            {/* TABS */}
            <div className="flex border-b border-[#333]">
                <button
                    onClick={() => setActiveTab('fog')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${activeTab === 'fog'
                        ? 'text-[#c0a080] border-b-2 border-[#c0a080] bg-white/5'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                        }`}
                >
                    <Cloud className="w-4 h-4" />
                    Brouillard
                </button>
                <button
                    onClick={() => setActiveTab('obstacles')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${activeTab === 'obstacles'
                        ? 'text-[#c0a080] border-b-2 border-[#c0a080] bg-white/5'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                        }`}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <polyline points="4,18 10,8 18,12 22,4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Obstacles
                </button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">

                    {/* ===== TAB BROUILLARD ===== */}
                    {activeTab === 'fog' && (
                        <>
                            {/* Outils */}
                            <div className="space-y-2">
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Outils</span>
                                <Button
                                    variant="ghost"
                                    className={`w-full justify-start gap-3 h-10 rounded-lg transition-all duration-200 ${vs.currentVisibilityTool === 'fog'
                                        ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]'
                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    onClick={() => vs.setCurrentVisibilityTool('fog')}
                                    title="Clic gauche = ajouter, clic droit = retirer"
                                >
                                    <Cloud className="w-5 h-5" strokeWidth={vs.currentVisibilityTool === 'fog' ? 2.5 : 2} />
                                    <div className="flex flex-col items-start">
                                        <span className="text-sm">Peindre</span>
                                        <span className="text-[10px] opacity-60">Clic gauche / droit</span>
                                    </div>
                                </Button>

                                <Button
                                    variant="ghost"
                                    className={`w-full justify-start gap-3 h-10 rounded-lg transition-all duration-200 ${vs.fullMapFog
                                        ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]'
                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    onClick={() => vs.handleFullMapFogChange(!vs.fullMapFog)}
                                >
                                    {vs.fullMapFog ? <EyeOff className="w-5 h-5" strokeWidth={2.5} /> : <Eye className="w-5 h-5" />}
                                    <div className="flex flex-col items-start">
                                        <span className="text-sm">Brouillard total</span>
                                        <span className="text-[10px] opacity-60">{vs.fullMapFog ? 'Actif - cliquer pour retirer' : 'Couvrir toute la carte'}</span>
                                    </div>
                                </Button>
                            </div>

                            {/* Zone de danger */}
                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Supprimer</span>

                                <Button
                                    variant="ghost"
                                    className="w-full justify-start gap-3 h-10 rounded-lg transition-all duration-200 text-gray-400 hover:text-red-400 hover:bg-red-900/20"
                                    onClick={() => {
                                        if (window.confirm("Supprimer tout le brouillard ?")) {
                                            if (vs.fullMapFog) {
                                                vs.setFullMapFog(false);
                                                vs.saveFullMapFog(false);
                                            }
                                            vs.setFogGrid(new Map());
                                            vs.saveFogGridWithHistory(new Map(), 'Suppression de tout le brouillard');
                                        }
                                    }}
                                >
                                    <Trash2 className="w-5 h-5" />
                                    <span className="text-sm">Tout supprimer</span>
                                </Button>

                                {vs.selectedFogCells.length > 0 && (
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-start gap-3 h-10 rounded-lg transition-all duration-200 bg-amber-900/30 text-amber-400 hover:text-amber-300 hover:bg-amber-900/40"
                                        onClick={() => {
                                            if (window.confirm(`Supprimer ${vs.selectedFogCells.length} case(s) s\u00e9lectionn\u00e9e(s) ?`)) {
                                                const newGrid = new Map(vs.fogGrid);
                                                vs.selectedFogCells.forEach(cellKey => {
                                                    if (vs.fullMapFog) {
                                                        newGrid.set(cellKey, true);
                                                    } else {
                                                        newGrid.delete(cellKey);
                                                    }
                                                });
                                                vs.setFogGrid(newGrid);
                                                vs.saveFogGridWithHistory(newGrid, 'Suppression de cellules s\u00e9lectionn\u00e9es');
                                                vs.setSelectedFogCells([]);
                                            }
                                        }}
                                    >
                                        <div className="relative">
                                            <Trash2 className="w-5 h-5" />
                                            <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                                {vs.selectedFogCells.length}
                                            </span>
                                        </div>
                                        <span className="text-sm">Supprimer s&eacute;lection ({vs.selectedFogCells.length})</span>
                                    </Button>
                                )}
                            </div>
                        </>
                    )}

                    {/* ===== TAB OBSTACLES ===== */}
                    {activeTab === 'obstacles' && (
                        <>
                            {/* Outils de dessin */}
                            <div className="space-y-2">
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Dessiner</span>

                                <Button
                                    variant="ghost"
                                    className={`w-full justify-start gap-3 h-10 rounded-lg transition-all duration-200 ${vs.currentVisibilityTool === 'chain'
                                        ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]'
                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    onClick={() => vs.setCurrentVisibilityTool('chain')}
                                    title="Clic pour cha\u00eener, Escape pour terminer"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={vs.currentVisibilityTool === 'chain' ? 2.5 : 2}>
                                        <polyline points="4,18 10,8 18,12 22,4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <div className="flex flex-col items-start">
                                        <span className="text-sm">Dessiner murs</span>
                                        <span className="text-[10px] opacity-60">Clic pour cha&icirc;ner, Echap pour finir</span>
                                    </div>
                                </Button>

                                {/* Placer sur un mur existant (drag & drop) */}
                                <div className="space-y-2 pt-2 border-t border-white/5">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Placer sur un mur</span>

                                    <div
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('application/json', JSON.stringify({
                                                type: 'obstacle_feature',
                                                featureType: 'door',
                                            }));
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-green-500/20 bg-green-500/5 cursor-grab active:cursor-grabbing hover:bg-green-500/10 transition-all group"
                                    >
                                        <GripVertical className="w-4 h-4 text-green-500/40 group-hover:text-green-500/60 flex-shrink-0" />
                                        <DoorOpen className="w-5 h-5 text-green-400 flex-shrink-0" />
                                        <div className="flex flex-col">
                                            <span className="text-sm text-green-300">Porte</span>
                                            <span className="text-[10px] text-gray-500">Glisser sur un mur</span>
                                        </div>
                                    </div>

                                    <div
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('application/json', JSON.stringify({
                                                type: 'obstacle_feature',
                                                featureType: 'one-way-wall',
                                            }));
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-orange-500/20 bg-orange-500/5 cursor-grab active:cursor-grabbing hover:bg-orange-500/10 transition-all group"
                                    >
                                        <GripVertical className="w-4 h-4 text-orange-500/40 group-hover:text-orange-500/60 flex-shrink-0" />
                                        <ArrowRight className="w-5 h-5 text-orange-400 flex-shrink-0" />
                                        <div className="flex flex-col">
                                            <span className="text-sm text-orange-300">Mur &agrave; sens unique</span>
                                            <span className="text-[10px] text-gray-500">Glisser sur un mur</span>
                                        </div>
                                    </div>

                                    <div
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('application/json', JSON.stringify({
                                                type: 'obstacle_feature',
                                                featureType: 'window',
                                            }));
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-blue-400/20 bg-blue-400/5 cursor-grab active:cursor-grabbing hover:bg-blue-400/10 transition-all group"
                                    >
                                        <GripVertical className="w-4 h-4 text-blue-400/40 group-hover:text-blue-400/60 flex-shrink-0" />
                                        <svg className="w-5 h-5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                            <rect x="3" y="3" width="18" height="18" rx="2" />
                                            <line x1="12" y1="3" x2="12" y2="21" />
                                            <line x1="3" y1="12" x2="21" y2="12" />
                                        </svg>
                                        <div className="flex flex-col">
                                            <span className="text-sm text-blue-300">Fen&ecirc;tre</span>
                                            <span className="text-[10px] text-gray-500">Glisser sur un mur</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Outils d'edition */}
                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">&Eacute;dition</span>

                                <Button
                                    variant="ghost"
                                    className={`w-full justify-start gap-3 h-10 rounded-lg transition-all duration-200 ${vs.currentVisibilityTool === 'edit'
                                        ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]'
                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    onClick={() => vs.setCurrentVisibilityTool('edit')}
                                >
                                    <MousePointer className="w-5 h-5" strokeWidth={vs.currentVisibilityTool === 'edit' ? 2.5 : 2} />
                                    <div className="flex flex-col items-start">
                                        <span className="text-sm">S&eacute;lectionner / D&eacute;placer</span>
                                        <span className="text-[10px] opacity-60">Cliquer sur un mur pour le modifier</span>
                                    </div>
                                </Button>

                                <Button
                                    variant="ghost"
                                    className={`w-full justify-start gap-3 h-10 rounded-lg transition-all duration-200 ${vs.isLightPlacementMode
                                        ? 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30'
                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                        }`}
                                    onClick={() => {
                                        const newMode = !vs.isLightPlacementMode;
                                        vs.setIsLightPlacementMode(newMode);
                                        if (newMode) {
                                            vs.setCurrentVisibilityTool('none');
                                            vs.setDrawMode(false);
                                        }
                                    }}
                                >
                                    <Lightbulb className="w-5 h-5" strokeWidth={vs.isLightPlacementMode ? 2.5 : 2} />
                                    <div className="flex flex-col items-start">
                                        <span className="text-sm">Source de lumi&egrave;re</span>
                                        <span className="text-[10px] opacity-60">Placer un point lumineux</span>
                                    </div>
                                </Button>
                            </div>

                            {/* Opacite des ombres */}
                            <div className="space-y-3 pt-2 border-t border-white/5">
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Opacit&eacute; des ombres</span>
                                <div className="px-1 space-y-2">
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="10"
                                        value={vs.shadowOpacity * 100}
                                        onChange={(e) => vs.updateShadowOpacity(parseInt(e.target.value) / 100)}
                                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#c0a080]"
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-500">
                                        <span>Transparent</span>
                                        <span className="font-mono text-[#c0a080] bg-black/30 px-1.5 py-0.5 rounded">
                                            {Math.round(vs.shadowOpacity * 100)}%
                                        </span>
                                        <span>Opaque</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                </div>
            </ScrollArea>
        </div>
    )
}
