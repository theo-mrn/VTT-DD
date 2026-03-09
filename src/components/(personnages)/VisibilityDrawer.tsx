"use client"

import React, { useState, useEffect } from 'react'
import { Eye, EyeOff, Cloud, Trash2, MousePointer, Lightbulb, ArrowRight, DoorOpen, X, GripVertical, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext'
import type { VisibilityState } from '@/hooks/map/useVisibilityState'

interface VisibilityDrawerProps {
    isOpen: boolean
    onClose: () => void
    vs: VisibilityState
    isEmbedded?: boolean
}

type ConfirmAction =
    | { type: 'clear-fog' }
    | { type: 'clear-fog-selection'; count: number }
    | { type: 'clear-obstacles' }
    | null

export function VisibilityDrawer({ isOpen, onClose, vs, isEmbedded }: VisibilityDrawerProps) {
    const { setDialogOpen } = useDialogVisibility();
    const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

    // Auto-activate visibility tools when embedded (uses window flag to avoid opening standalone drawer)
    const activateTool = (tool: string) => {
        if (isEmbedded) {
            (window as any).__visibilityToolsActive = true;
        }
        vs.setCurrentVisibilityTool(tool as any);
    };

    useEffect(() => {
        setDialogOpen(isOpen);
        // Quand le drawer se ferme (embedded ou standalone), réinitialiser les outils
        if (!isOpen) {
            (window as any).__visibilityToolsActive = false;
            vs.setCurrentVisibilityTool('none');
            vs.setIsLightPlacementMode(false);
        }
        // Cleanup on unmount (ex: tab switch in UnifiedSearchDrawer, component removed from DOM)
        return () => {
            (window as any).__visibilityToolsActive = false;
        };
    }, [isOpen, setDialogOpen]);

    // Activate flag when embedded and a tool gets selected
    useEffect(() => {
        if (isEmbedded && isOpen && vs.currentVisibilityTool !== 'none') {
            (window as any).__visibilityToolsActive = true;
        }
    }, [isEmbedded, isOpen, vs.currentVisibilityTool]);

    const handleConfirm = () => {
        if (!confirmAction) return;

        if (confirmAction.type === 'clear-fog') {
            if (vs.fullMapFog) {
                vs.setFullMapFog(false);
                vs.saveFullMapFog(false);
            }
            vs.setFogGrid(new Map());
            vs.saveFogGridWithHistory(new Map(), 'Suppression de tout le brouillard');
        }

        if (confirmAction.type === 'clear-fog-selection') {
            const newGrid = new Map(vs.fogGrid);
            vs.selectedFogCells.forEach(cellKey => {
                if (vs.fullMapFog) {
                    newGrid.set(cellKey, true);
                } else {
                    newGrid.delete(cellKey);
                }
            });
            vs.setFogGrid(newGrid);
            vs.saveFogGridWithHistory(newGrid, 'Suppression de cellules sélectionnées');
            vs.setSelectedFogCells([]);
        }

        if (confirmAction.type === 'clear-obstacles') {
            // Clear all obstacles by setting to empty — handled in page.tsx via vs
            // Use setObstacles to clear local state (DB sync handled by page.tsx listeners)
            vs.setObstacles([]);
        }

        setConfirmAction(null);
    };

    const getConfirmContent = () => {
        if (!confirmAction) return { title: '', description: '', icon: null, danger: false };

        if (confirmAction.type === 'clear-fog') return {
            title: 'Supprimer tout le brouillard',
            description: 'Cette action supprimera définitivement tout le brouillard de guerre sur la carte. Cette opération ne peut pas être annulée.',
            icon: <Cloud className="w-5 h-5 text-[#c0a080]" />,
            danger: true,
        };

        if (confirmAction.type === 'clear-fog-selection') return {
            title: `Supprimer la sélection`,
            description: `Vous allez supprimer ${confirmAction.count} case${confirmAction.count > 1 ? 's' : ''} de brouillard sélectionnée${confirmAction.count > 1 ? 's' : ''}. Cette opération ne peut pas être annulée.`,
            icon: <Cloud className="w-5 h-5 text-amber-400" />,
            danger: true,
        };

        if (confirmAction.type === 'clear-obstacles') return {
            title: 'Supprimer tous les obstacles',
            description: 'Cette action supprimera définitivement tous les murs et obstacles de la carte. Cette opération ne peut pas être annulée.',
            icon: <svg className="w-5 h-5 text-[#c0a080]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="4,18 10,8 18,12 22,4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
            danger: true,
        };

        return { title: '', description: '', icon: null, danger: false };
    };

    if (!isOpen) return null

    const { title, description, icon } = getConfirmContent();

    return (
        <>
            {/* ===== CONFIRM MODAL ===== */}
            <Dialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
                <DialogContent showCloseButton={false}>
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-10 h-10 rounded-xl bg-red-950/50 border border-red-900/50 flex items-center justify-center flex-shrink-0">
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <DialogTitle className="text-base text-white">{title}</DialogTitle>
                                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                    {icon}
                                    <span>Action irréversible</span>
                                </div>
                            </div>
                        </div>
                        <DialogDescription className="text-sm text-gray-400 leading-relaxed">
                            {description}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-2">
                        <Button
                            variant="ghost"
                            onClick={() => setConfirmAction(null)}
                            className="text-gray-400 hover:text-white hover:bg-white/10"
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            className="bg-red-600 hover:bg-red-500 text-white border-0"
                        >
                            <Trash2 className="w-4 h-4 mr-1.5" />
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ===== DRAWER ===== */}
            <div className={isEmbedded ? "flex flex-col h-full w-full bg-[#1a1a1a]" : "fixed right-0 top-0 h-full w-80 bg-[#1a1a1a] border-l border-[#333] z-[99999900] flex flex-col shadow-2xl"}>
                {/* HEADER */}
                {!isEmbedded && (
                    <div className="relative px-6 py-5 border-b border-[#333] bg-gradient-to-br from-[#1a1a1a] via-[#1a1a1a] to-[#252525]">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c0a080] to-[#a08060] flex items-center justify-center shadow-lg shadow-[#c0a080]/20">
                                    <Eye className="w-5 h-5 text-black" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white tracking-tight">Visibilité</h2>
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
                )}

                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-8">

                        {/* ===== SECTION BROUILLARD ===== */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                <div className="flex items-center gap-2">
                                    <Cloud className="w-4 h-4 text-[#c0a080]" />
                                    <h3 className="text-xs font-bold text-[#c0a080] uppercase tracking-wider">Brouillard</h3>
                                </div>
                            </div>

                            {/* Toolbar Horizontale Brouillard */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-12 w-12 rounded-xl border transition-all duration-200 ${vs.currentVisibilityTool === 'fog'
                                        ? 'bg-[#c0a080] border-[#c0a080] text-black hover:bg-[#d4b494]'
                                        : 'bg-[#252525] border-[#333] text-gray-400 hover:text-white hover:border-[#444]'
                                        }`}
                                    onClick={() => activateTool('fog')}
                                    title="Peindre le brouillard (Clic gauche: ajouter, Clic droit: retirer)"
                                >
                                    <Cloud className="w-5 h-5" strokeWidth={vs.currentVisibilityTool === 'fog' ? 2.5 : 2} />
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-12 w-12 rounded-xl border transition-all duration-200 ${vs.fullMapFog
                                        ? 'bg-[#c0a080]/20 border-[#c0a080]/50 text-[#c0a080] hover:bg-[#c0a080]/30'
                                        : 'bg-[#252525] border-[#333] text-gray-400 hover:text-white hover:border-[#444]'
                                        }`}
                                    onClick={() => vs.handleFullMapFogChange(!vs.fullMapFog)}
                                    title={vs.fullMapFog ? 'Retirer le brouillard total' : 'Appliquer le brouillard total'}
                                >
                                    {vs.fullMapFog ? <EyeOff className="w-5 h-5" strokeWidth={2} /> : <Eye className="w-5 h-5" />}
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-12 w-12 rounded-xl border border-[#333] bg-[#252525] text-gray-400 hover:text-red-400 hover:border-red-900/50 hover:bg-red-950/20 transition-all duration-200"
                                    onClick={() => setConfirmAction({ type: 'clear-fog' })}
                                    title="Tout supprimer"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </Button>

                                {vs.selectedFogCells.length > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-12 w-12 rounded-xl border border-amber-900/50 bg-amber-950/20 text-amber-400 hover:text-amber-300 hover:bg-amber-900/40 relative animate-pulse"
                                        onClick={() => setConfirmAction({ type: 'clear-fog-selection', count: vs.selectedFogCells.length })}
                                        title={`Supprimer la sélection (${vs.selectedFogCells.length})`}
                                    >
                                        <Trash2 className="w-5 h-5" />
                                        <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                                            {vs.selectedFogCells.length}
                                        </span>
                                    </Button>
                                )}

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-12 w-12 rounded-xl border transition-all duration-200 ${vs.isLightPlacementMode
                                        ? 'bg-yellow-500 border-yellow-500 text-black hover:bg-yellow-400'
                                        : 'bg-[#252525] border-[#333] text-gray-400 hover:text-white hover:border-[#444]'
                                        }`}
                                    onClick={() => {
                                        const newMode = !vs.isLightPlacementMode;
                                        if (isEmbedded) (window as any).__visibilityToolsActive = true;
                                        vs.setIsLightPlacementMode(newMode);
                                        if (newMode) {
                                            vs.setCurrentVisibilityTool('none');
                                            vs.setDrawMode(false);
                                        }
                                    }}
                                    title="Placer une source de lumière"
                                >
                                    <Lightbulb className="w-5 h-5" strokeWidth={vs.isLightPlacementMode ? 2.5 : 2} />
                                </Button>
                            </div>
                        </section>

                        {/* ===== SECTION OBSTACLES ===== */}
                        <section className="space-y-4 pt-4 border-t border-white/5">
                            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-[#c0a080]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                        <polyline points="4,18 10,8 18,12 22,4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <h3 className="text-xs font-bold text-[#c0a080] uppercase tracking-wider">Obstacles & Murs</h3>
                                </div>
                            </div>

                            {/* Toolbar Obstacles */}
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-12 w-12 rounded-xl border transition-all duration-200 ${vs.currentVisibilityTool === 'chain'
                                        ? 'bg-[#c0a080] border-[#c0a080] text-black hover:bg-[#d4b494]'
                                        : 'bg-[#252525] border-[#333] text-gray-400 hover:text-white hover:border-[#444]'
                                        }`}
                                    onClick={() => activateTool('chain')}
                                    title="Dessiner des murs (Clic pour chaîner, Echap pour finir)"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={vs.currentVisibilityTool === 'chain' ? 2.5 : 2}>
                                        <polyline points="4,18 10,8 18,12 22,4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-12 w-12 rounded-xl border transition-all duration-200 ${vs.currentVisibilityTool === 'edit'
                                        ? 'bg-[#c0a080] border-[#c0a080] text-black hover:bg-[#d4b494]'
                                        : 'bg-[#252525] border-[#333] text-gray-400 hover:text-white hover:border-[#444]'
                                        }`}
                                    onClick={() => activateTool('edit')}
                                    title="Modifier / Déplacer (Cliquer sur un mur)"
                                >
                                    <MousePointer className="w-5 h-5" strokeWidth={vs.currentVisibilityTool === 'edit' ? 2.5 : 2} />
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-12 w-12 rounded-xl border border-[#333] bg-[#252525] text-gray-400 hover:text-red-400 hover:border-red-900/50 hover:bg-red-950/20 transition-all duration-200"
                                    onClick={() => setConfirmAction({ type: 'clear-obstacles' })}
                                    title="Tout supprimer"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </Button>
                            </div>

                            {/* Features Draggable (Vertical List) */}
                            <div className="space-y-2">
                                <div
                                    draggable
                                    onDragStart={(e) => {
                                        (window as any).__isDraggingObstacleFeature = true;
                                        e.dataTransfer.setData('application/json', JSON.stringify({
                                            type: 'obstacle_feature',
                                            featureType: 'door',
                                        }));
                                        e.dataTransfer.effectAllowed = 'copy';
                                    }}
                                    onDragEnd={() => { (window as any).__isDraggingObstacleFeature = false; }}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-green-500/20 bg-green-500/5 cursor-grab active:cursor-grabbing hover:bg-green-500/10 transition-all group"
                                    title="Faire glisser sur un mur pour placer une Porte"
                                >
                                    <GripVertical className="w-4 h-4 text-green-500/40 group-hover:text-green-500/70 flex-shrink-0 transition-colors" />
                                    <DoorOpen className="w-5 h-5 text-green-400 flex-shrink-0" />
                                    <div className="flex flex-col">
                                        <span className="text-sm text-green-300">Porte</span>
                                        <span className="text-[10px] text-gray-500">Glisser sur un mur</span>
                                    </div>
                                </div>

                                <div
                                    draggable
                                    onDragStart={(e) => {
                                        (window as any).__isDraggingObstacleFeature = true;
                                        e.dataTransfer.setData('application/json', JSON.stringify({
                                            type: 'obstacle_feature',
                                            featureType: 'one-way-wall',
                                        }));
                                        e.dataTransfer.effectAllowed = 'copy';
                                    }}
                                    onDragEnd={() => { (window as any).__isDraggingObstacleFeature = false; }}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-orange-500/20 bg-orange-500/5 cursor-grab active:cursor-grabbing hover:bg-orange-500/10 transition-all group"
                                    title="Faire glisser sur un mur pour un sens unique"
                                >
                                    <GripVertical className="w-4 h-4 text-orange-500/40 group-hover:text-orange-500/70 flex-shrink-0 transition-colors" />
                                    <ArrowRight className="w-5 h-5 text-orange-400 flex-shrink-0" />
                                    <div className="flex flex-col">
                                        <span className="text-sm text-orange-300">Sens unique</span>
                                        <span className="text-[10px] text-gray-500">Glisser sur un mur</span>
                                    </div>
                                </div>

                                <div
                                    draggable
                                    onDragStart={(e) => {
                                        (window as any).__isDraggingObstacleFeature = true;
                                        e.dataTransfer.setData('application/json', JSON.stringify({
                                            type: 'obstacle_feature',
                                            featureType: 'window',
                                        }));
                                        e.dataTransfer.effectAllowed = 'copy';
                                    }}
                                    onDragEnd={() => { (window as any).__isDraggingObstacleFeature = false; }}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-blue-400/20 bg-blue-400/5 cursor-grab active:cursor-grabbing hover:bg-blue-400/10 transition-all group"
                                    title="Faire glisser sur un mur pour une Fenêtre"
                                >
                                    <GripVertical className="w-4 h-4 text-blue-400/40 group-hover:text-blue-400/70 flex-shrink-0 transition-colors" />
                                    <svg className="w-5 h-5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                        <rect x="3" y="3" width="18" height="18" rx="2" />
                                        <line x1="12" y1="3" x2="12" y2="21" />
                                        <line x1="3" y1="12" x2="21" y2="12" />
                                    </svg>
                                    <div className="flex flex-col">
                                        <span className="text-sm text-blue-300">Fenêtre</span>
                                        <span className="text-[10px] text-gray-500">Glisser sur un mur</span>
                                    </div>
                                </div>
                            </div>

                            {/* Opacité des ombres */}
                            <div className="space-y-3 pt-2 border-t border-white/5">
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Opacité des ombres</span>
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
                        </section>

                    </div>
                </ScrollArea>
            </div>
        </>
    )
}
