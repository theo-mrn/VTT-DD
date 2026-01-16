"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Keyboard, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useShortcuts, SHORTCUT_ACTIONS, formatKeyEvent } from "@/contexts/ShortcutsContext";
import { cn } from "@/lib/utils";

function ShortcutRecorder({ actionId, label }: { actionId: string, label: string }) {
    const { getShortcutLabel, updateShortcut } = useShortcuts();
    const [isRecording, setIsRecording] = useState(false);
    const [recordingKeys, setRecordingKeys] = useState<string[]>([]);
    const currentShortcut = getShortcutLabel(actionId);

    // Reset recording keys when recording starts
    useEffect(() => {
        if (isRecording) setRecordingKeys([]);
    }, [isRecording]);

    useEffect(() => {
        if (!isRecording) return;
        const handler = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            // Cancel on Escape
            if (e.key === 'Escape') {
                setIsRecording(false);
                setRecordingKeys([]);
                return;
            }

            // Save on Enter
            if (e.key === 'Enter') {
                if (recordingKeys.length > 0) {
                    updateShortcut(actionId, recordingKeys.join(' '));
                }
                setIsRecording(false);
                return;
            }

            // Remove last key on Backspace
            if (e.key === 'Backspace') {
                setRecordingKeys(prev => prev.slice(0, -1));
                return;
            }

            // Ignore standalone modifiers
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                return;
            }

            const combo = formatKeyEvent(e);
            setRecordingKeys(prev => [...prev, combo]);
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isRecording, actionId, updateShortcut, recordingKeys]);

    const displayKeys = isRecording ? recordingKeys : (currentShortcut ? currentShortcut.split(' ') : []);

    return (
        <div className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-black/20 hover:bg-black/40 transition-colors">
            <span className="text-sm font-medium text-gray-300">{label}</span>
            <Button
                variant={isRecording ? "destructive" : "secondary"}
                size="sm"
                onClick={() => setIsRecording(!isRecording)}
                className={cn(
                    "min-w-[100px] font-mono",
                    isRecording && "animate-pulse"
                )}
            >
                {isRecording ? "Enregistrement..." : (displayKeys.join(' + ') || "Aucun")}
            </Button>
        </div>
    );
}

export function ShortcutsDialog({
    isOpen,
    onClose,
    isMJ
}: {
    isOpen: boolean;
    onClose: () => void;
    isMJ: boolean;
}) {
    const { resetShortcuts } = useShortcuts();
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            // Focus with slight delay to ensure render
            setTimeout(() => contentRef.current?.focus(), 50);
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                ref={contentRef}
                tabIndex={-1}
                className="bg-[#1c1c1c] border border-white/10 rounded-xl w-[90vw] max-w-2xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 outline-none"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header - Fixed */}
                <div className="shrink-0 flex items-center justify-between p-6 border-b border-white/5 bg-[#242424]">
                    <div className="space-y-1">
                        <h2 className="text-xl font-title text-[#c0a080] flex items-center gap-2">
                            <Keyboard className="w-5 h-5" />
                            Raccourcis Clavier
                        </h2>
                        <p className="text-sm text-gray-500">Personnalisez vos commandes rapides</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetShortcuts}
                            className="text-xs h-8 hover:text-red-400 hover:bg-red-950/20"
                        >
                            <RotateCcw className="w-3 h-3 mr-1.5" />
                            Rétablir Défauts
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-8 w-8 hover:bg-white/10 rounded-full"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-8">
                    {/* Sidebar Shortcuts */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 border-l-2 border-[#c0a080] ml-1 pl-3">Navigation</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

                    {/* Dice Shortcuts */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 border-l-2 border-[#c0a080] ml-1 pl-3">Lancer de dés</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.ROLL_D4} label="Lancer d4" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.ROLL_D6} label="Lancer d6" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.ROLL_D8} label="Lancer d8" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.ROLL_D10} label="Lancer d10" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.ROLL_D12} label="Lancer d12" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.ROLL_D20} label="Lancer d20" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.ROLL_D100} label="Lancer d100" />
                        </div>
                    </div>

                    {/* Map Tools Shortcuts */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 border-l-2 border-[#c0a080] ml-1 pl-3">Outils de Carte</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 border-l-2 border-[#c0a080] ml-1 pl-3">Interface & Vues</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_ZOOM_IN} label="Zoom Avant (+)" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_ZOOM_OUT} label="Zoom Arrière (-)" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_WORLD_MAP} label="Carte du Monde" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_SETTINGS} label="Paramètres" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_BORDERS} label="Bordures Perso" />
                            <ShortcutRecorder actionId={SHORTCUT_ACTIONS.TOOL_BADGES} label="Badges États" />
                        </div>
                    </div>
                </div>

                {/* Footer - Fixed */}
                <div className="shrink-0 p-4 border-t border-white/5 bg-[#242424] rounded-b-xl flex justify-end">
                    <Button variant="default" onClick={onClose} className="bg-[#c0a080] text-black hover:bg-[#b09070]">
                        Terminer
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}
