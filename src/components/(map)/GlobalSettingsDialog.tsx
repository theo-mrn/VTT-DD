"use client";

import React, { useState, useEffect } from 'react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useShortcuts, SHORTCUT_ACTIONS, formatKeyEvent } from "@/contexts/ShortcutsContext";
import { Button } from "@/components/ui/button";
import { Keyboard, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlobalSettingsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    isMJ: boolean;
    globalTokenScale: number;
    setGlobalTokenScale: (scale: number) => void;
    updateGlobalTokenScale: (scale: number) => void;
    performanceMode: 'high' | 'eco' | 'static';
    setPerformanceMode: (mode: 'high' | 'eco' | 'static') => void;
    showCharBorders: boolean;
    setShowCharBorders: (show: boolean) => void;
}

function ShortcutRecorder({ actionId, label }: { actionId: string, label: string }) {
    const { getShortcutLabel, updateShortcut } = useShortcuts();
    const [isRecording, setIsRecording] = useState(false);
    const currentShortcut = getShortcutLabel(actionId);

    useEffect(() => {
        if (!isRecording) return;
        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            // Cancel on Escape
            if (e.key === 'Escape') {
                setIsRecording(false);
                return;
            }

            const combo = formatKeyEvent(e);
            updateShortcut(actionId, combo);
            setIsRecording(false);
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isRecording, actionId, updateShortcut]);

    return (
        <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-black/20 hover:bg-black/40 transition-colors">
            <span className="text-sm font-medium text-gray-300">{label}</span>
            <Button
                variant={isRecording ? "destructive" : "secondary"}
                size="sm"
                onClick={() => setIsRecording(true)}
                className={cn(
                    "min-w-[100px] font-mono text-xs h-8 border border-white/10",
                    isRecording ? "animate-pulse" : ""
                )}
            >
                {isRecording ? "Appuyez..." : (currentShortcut || "Aucun")}
            </Button>
        </div>
    );
}

export default function GlobalSettingsDialog({
    isOpen,
    onOpenChange,
    isMJ,
    globalTokenScale,
    setGlobalTokenScale,
    updateGlobalTokenScale,
    performanceMode,
    setPerformanceMode,
    showCharBorders,
    setShowCharBorders
}: GlobalSettingsDialogProps) {
    const { resetShortcuts } = useShortcuts();

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="sm:max-w-[420px] w-full bg-[#1c1c1c] text-[#d4d4d4] border-l border-[#333] shadow-2xl p-0">
                <div className="flex flex-col h-full">
                    <SheetHeader className="p-6 pb-2 border-b border-white/5 bg-[#242424]">
                        <SheetTitle className="font-title text-2xl text-[#c0a080] tracking-wide">
                            Paramètres
                        </SheetTitle>
                        <SheetDescription className="text-gray-500">
                            Configuration globale de l'interface
                        </SheetDescription>
                    </SheetHeader>

                    <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden">
                        <div className="px-6 pt-4 bg-[#242424]">
                            <TabsList className="w-full bg-black/40 border border-white/5">
                                <TabsTrigger value="general" className="flex-1 data-[state=active]:bg-[#c0a080] data-[state=active]:text-black">Général</TabsTrigger>
                                <TabsTrigger value="shortcuts" className="flex-1 data-[state=active]:bg-[#c0a080] data-[state=active]:text-black">Raccourcis</TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            <TabsContent value="general" className="p-6 space-y-8 m-0 focus-visible:ring-0">
                                {/* GM Section */}
                                {isMJ && (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-title text-sm font-semibold text-white uppercase tracking-wider">
                                                Maître du Jeu
                                            </h4>
                                            <Separator className="flex-1 bg-white/10" />
                                        </div>

                                        <Card className="p-5 border-white/5 bg-black/20 shadow-none">
                                            <div className="space-y-5">
                                                <div className="flex items-center justify-between">
                                                    <Label htmlFor="token-scale" className="text-base font-medium text-gray-200">
                                                        Échelle des Pions
                                                    </Label>
                                                    <span className="text-sm font-mono font-bold text-[#c0a080] bg-[#c0a080]/10 px-2.5 py-1 rounded-md border border-[#c0a080]/20">
                                                        x{globalTokenScale.toFixed(1)}
                                                    </span>
                                                </div>
                                                <Slider
                                                    id="token-scale"
                                                    min={0.5}
                                                    max={3}
                                                    step={0.1}
                                                    value={[globalTokenScale]}
                                                    onValueChange={(vals) => setGlobalTokenScale(vals[0])}
                                                    onValueCommit={(vals) => updateGlobalTokenScale(vals[0])}
                                                    className="py-2"
                                                />
                                                <p className="text-xs text-gray-500 leading-relaxed">
                                                    Ajuste la taille globale de tous les pions sur la carte pour tous les joueurs.
                                                </p>
                                            </div>
                                        </Card>
                                    </div>
                                )}

                                {/* Display Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-title text-sm font-semibold text-white uppercase tracking-wider">
                                            Affichage
                                        </h4>
                                        <Separator className="flex-1 bg-white/10" />
                                    </div>

                                    <Card className="flex items-center justify-between p-5 border-white/5 bg-black/20 hover:bg-black/30 transition-all cursor-pointer" onClick={() => setShowCharBorders(!showCharBorders)}>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="char-borders" className="text-base font-medium text-gray-200 cursor-pointer pointer-events-none">
                                                Interface Personnages
                                            </Label>
                                            <p className="text-xs text-gray-500 pointer-events-none">
                                                Afficher cercles, noms et stats
                                            </p>
                                        </div>
                                        <Switch
                                            id="char-borders"
                                            checked={showCharBorders}
                                            onCheckedChange={setShowCharBorders}
                                            className="data-[state=checked]:bg-[#c0a080]"
                                        />
                                    </Card>
                                </div>

                                {/* Performance Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-title text-sm font-semibold text-white uppercase tracking-wider">
                                            Performance
                                        </h4>
                                        <Separator className="flex-1 bg-white/10" />
                                    </div>
                                    <Card className="p-1 border-white/5 bg-black/20">
                                        <Select
                                            value={performanceMode}
                                            onValueChange={(val: 'high' | 'eco' | 'static') => setPerformanceMode(val)}
                                        >
                                            <SelectTrigger className="w-full border-0 bg-transparent focus:ring-0 shadow-none h-14 pl-4 text-gray-200">
                                                <SelectValue placeholder="Sélectionner le mode" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#242424] border-[#333] text-gray-200">
                                                <SelectItem value="high" className="py-3 focus:bg-white/5 focus:text-white">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="font-semibold text-base">Haute Qualité</span>
                                                        <span className="text-gray-500 text-xs">Expérience visuelle maximale (Défaut)</span>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="eco" className="py-3 focus:bg-white/5 focus:text-white">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="font-semibold text-base">Économie</span>
                                                        <span className="text-gray-500 text-xs">Limité à 30 FPS pour économiser la batterie</span>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="static" className="py-3 focus:bg-white/5 focus:text-white">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="font-semibold text-base">Statique</span>
                                                        <span className="text-gray-500 text-xs">Pas d'animations, performance maximale</span>
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </Card>
                                </div>
                            </TabsContent>

                            <TabsContent value="shortcuts" className="p-6 space-y-6 m-0 focus-visible:ring-0">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="space-y-1">
                                        <h3 className="font-medium text-white flex items-center gap-2">
                                            <Keyboard className="w-4 h-4 text-[#c0a080]" />
                                            Raccourcis Clavier
                                        </h3>
                                        <p className="text-xs text-gray-500">Cliquez pour enregistrer un nouveau raccourci.</p>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={resetShortcuts} className="text-xs h-7 hover:text-red-400">
                                        <RotateCcw className="w-3 h-3 mr-1.5" />
                                        Rétablir
                                    </Button>
                                </div>

                                <div className="space-y-6">
                                    {/* Sidebar Shortcuts */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Navigation (Sidebar)</h4>
                                        <div className="space-y-2">
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TAB_CHAT} label="Chat" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TAB_DICE} label="Lanceur de Dés" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TAB_NOTES} label="Notes" />
                                            {isMJ && (
                                                <>
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TAB_COMBAT} label="Tableau de Bord MJ" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TAB_NPC} label="Gestion PNJ" />
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <Separator className="bg-white/5" />

                                    {/* Map Tools Shortcuts */}
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Outils de Carte</h4>
                                        <div className="space-y-2">
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_PAN} label="Déplacement (Pan)" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_SELECT} label="Sélection (Défaut)" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_DRAW} label="Dessin" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_MEASURE} label="Mesure" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_GRID} label="Afficher/Masquer Grille" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_CLEAR} label="Effacer Dessins" />
                                            {isMJ && (
                                                <>
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_FOG} label="Brouillard de Guerre" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_MULTI} label="Sélection Multiple" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_LAYERS} label="Calques" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_BACKGROUND} label="Changer Fond" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_VIEW_MODE} label="Vue Joueur" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_ADD_CHAR} label="Ajouter Personnage" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_ADD_OBJ} label="Ajouter Objet" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_ADD_NOTE} label="Ajouter Note" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_MUSIC} label="Musique / Sons" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_MIXER} label="Table de Mixage" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_SEARCH} label="Recherche Unifiée" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_PORTAL} label="Portails" />
                                                    <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_SPAWN} label="Point d'Apparition" />
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <Separator className="bg-white/5" />

                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Interface & Vues</h4>
                                        <div className="space-y-2">
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_ZOOM_IN} label="Zoom Avant (+)" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_ZOOM_OUT} label="Zoom Arrière (-)" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_WORLD_MAP} label="Carte du Monde" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_SETTINGS} label="Paramètres" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_BORDERS} label="Bordures Perso" />
                                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_BADGES} label="Badges États" />
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </SheetContent>
        </Sheet>
    );
}
