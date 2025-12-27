
"use client";

import React, { useState, useEffect } from 'react';
import { useGame } from '@/contexts/GameContext';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
    Shield,
    Heart,
    Sword,
    Zap,
    Skull,
    Eye,
    EyeOff,
    Trash2,
    Edit,
    FileText,
    Target,
    MoreHorizontal,
    X,
    User,
    Sparkles,
    ChevronRight,
    Plus
} from 'lucide-react';
import { CONDITIONS } from '@/components/(combat)/MJcombat';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Character } from '@/app/[roomid]/map/types';

interface ContextMenuPanelProps {
    character: Character | null;
    isOpen: boolean;
    onClose: () => void;
    onAction: (action: string, characterId: string, value?: any) => void;
    isMJ: boolean;
}

export default function ContextMenuPanel({
    character,
    isOpen,
    onClose,
    onAction,
    isMJ
}: ContextMenuPanelProps) {
    const dragControls = useDragControls();
    const [customCondition, setCustomCondition] = useState("");

    if (!character) return null;

    // Determine if the user allows to see detailed info (Stats, Sheet, details)
    // Visible for GM, Allies, or other Players
    const canViewDetails = isMJ || character.visibility === 'ally' || character.type === 'joueurs';

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
                    className="fixed right-24 top-24 max-h-[80vh] w-80 bg-[#1e1e1e]/95 backdrop-blur-md border border-[#333] rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
                >
                    {/* Header avec Image et Nom */}
                    <div
                        className="relative cursor-move"
                        onPointerDown={(e) => dragControls.start(e)}
                    >
                        {/* Background Image Floutée */}
                        <div className="absolute inset-0 bg-[#111] opacity-50 z-0">
                            {character.image && (
                                <img
                                    src={character.image.src || ""}
                                    className="w-full h-full object-cover blur-sm opacity-30"
                                    alt=""
                                />
                            )}
                        </div>

                        <div className="relative z-10 p-5 flex flex-col items-center gap-3">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 h-6 w-6 text-gray-400 hover:text-white"
                                onClick={onClose}
                            >
                                <X size={16} />
                            </Button>

                            <Avatar className="h-24 w-24 border-4 border-[#c0a080] shadow-lg">
                                <AvatarImage src={character.image?.src} className="object-cover" />
                                <AvatarFallback className="bg-[#2a2a2a] text-2xl">{character.name[0]}</AvatarFallback>
                            </Avatar>

                            <div className="text-center">
                                <h2 className="text-xl font-bold text-[#e0e0e0] font-serif tracking-wide">{character.name}</h2>
                                <div className="flex gap-2 justify-center mt-1">
                                    {canViewDetails && (
                                        <Badge variant="outline" className="bg-[#2a2a2a] text-gray-300 border-gray-700">Niv {character.niveau}</Badge>
                                    )}
                                    <Badge variant={character.type === 'joueurs' ? "default" : "secondary"} className={character.type === 'joueurs' ? "bg-blue-600 hover:bg-blue-700" : "bg-orange-600 hover:bg-orange-700"}>
                                        {character.type === 'joueurs' ? 'Joueur' : 'PNJ'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator className="bg-[#333]" />

                    <ScrollArea className="flex-1 overflow-y-auto">
                        <div className="p-4">
                            {/* Stats Rapides - CONDITIONAL */}
                            {canViewDetails && (
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    <div className="bg-[#252525] p-3 rounded-lg border border-[#333] flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <Heart size={16} className="text-red-500" />
                                            <span className="text-sm font-medium">PV</span>
                                        </div>
                                        <span className="text-lg font-bold text-white">{character.PV}</span>
                                    </div>
                                    <div className="bg-[#252525] p-3 rounded-lg border border-[#333] flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-gray-400">
                                            <Shield size={16} className="text-blue-500" />
                                            <span className="text-sm font-medium">DEF</span>
                                        </div>
                                        <span className="text-lg font-bold text-white">{character.Defense}</span>
                                    </div>
                                </div>
                            )}

                            {/* --- ACTIONS SECONDAIRES (EFFETS) --- */}
                            {isMJ && (
                                <div className="mb-6">
                                    <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Effets & États</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        {CONDITIONS.map((condition) => {
                                            const isActive = character.conditions?.includes(condition.id);
                                            const Icon = condition.icon;
                                            return (
                                                <Button
                                                    key={condition.id}
                                                    variant="outline"
                                                    size="sm"
                                                    className={`justify-start gap-2 h-8 text-xs ${isActive ? 'bg-blue-900/40 border-blue-500/50 text-blue-200' : 'bg-[#252525] border-[#333] text-gray-400 hover:text-gray-200'}`}
                                                    onClick={() => onAction('toggleCondition', character.id, condition.id)}
                                                >
                                                    <Icon size={14} className={isActive ? condition.color : ""} />
                                                    {condition.label}
                                                </Button>
                                            );
                                        })}
                                    </div>

                                    {/* Active Custom Conditions */}
                                    {character.conditions && character.conditions.some(c => !CONDITIONS.some(cond => cond.id === c)) && (
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            {character.conditions.map(c => {
                                                const isPredefined = CONDITIONS.some(cond => cond.id === c);
                                                if (isPredefined) return null;

                                                return (
                                                    <Button
                                                        key={c}
                                                        variant="outline"
                                                        size="sm"
                                                        className="justify-between h-8 text-xs bg-blue-900/40 border-blue-500/50 text-blue-200 hover:bg-red-900/30 hover:border-red-800 hover:text-red-200 transition-colors group"
                                                        onClick={() => onAction('toggleCondition', character.id, c)}
                                                    >
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            <Sparkles size={14} className="text-purple-400 shrink-0" />
                                                            <span className="truncate">{c}</span>
                                                        </div>
                                                        <X size={14} className="opacity-50 group-hover:opacity-100" />
                                                    </Button>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* Custom Condition Input */}
                                    <div className="flex gap-2 mt-2 pt-2 border-t border-[#333]">
                                        <Input
                                            value={customCondition}
                                            onChange={(e) => setCustomCondition(e.target.value)}
                                            placeholder="Autre effet..."
                                            className="h-7 text-xs bg-[#252525] border-[#333] focus:border-blue-500/50"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && customCondition.trim()) {
                                                    onAction('toggleCondition', character.id, customCondition.trim());
                                                    setCustomCondition("");
                                                }
                                            }}
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0 hover:bg-[#333]"
                                            onClick={() => {
                                                if (customCondition.trim()) {
                                                    onAction('toggleCondition', character.id, customCondition.trim());
                                                    setCustomCondition("");
                                                }
                                            }}
                                        >
                                            <Plus size={14} />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Actions Principales */}
                            <div className="space-y-4">
                                <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Actions</h3>

                                <div className="grid grid-cols-2 gap-2">
                                    {canViewDetails && (
                                        <Button
                                            variant="outline"
                                            className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-[#c0a080] text-gray-300"
                                            onClick={() => onAction('openSheet', character.id)}
                                        >
                                            <FileText size={16} />
                                            Fiche
                                        </Button>
                                    )}

                                    <Button
                                        variant="outline"
                                        className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-red-400 text-gray-300"
                                        onClick={() => onAction('attack', character.id)}
                                    >
                                        <Sword size={16} />
                                        Attaquer
                                    </Button>
                                </div>

                                {isMJ && (
                                    <>
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            {character.type !== 'joueurs' && (
                                                <Button
                                                    variant="outline"
                                                    className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-yellow-400 text-gray-300"
                                                    onClick={() => onAction('edit', character.id)}
                                                >
                                                    <Edit size={16} />
                                                    Modifier
                                                </Button>
                                            )}

                                            {character.type !== 'joueurs' && (
                                                <Button
                                                    variant="outline"
                                                    className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-red-600 text-gray-300"
                                                    onClick={() => onAction('delete', character.id)}
                                                >
                                                    <Trash2 size={16} />
                                                    Supprimer
                                                </Button>
                                            )}
                                        </div>

                                        {/* Visibility Controls */}
                                        <div className="mt-4 space-y-2">
                                            {character.type !== 'joueurs' && (
                                                <>
                                                    <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Visibilité</h3>

                                                    <div className="grid grid-cols-3 gap-1">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={`text-xs ${character.visibility === 'visible' ? 'bg-blue-900/50 border-blue-700 text-blue-200' : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                            onClick={() => onAction('setVisibility', character.id, 'visible')}
                                                        >
                                                            Visible
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={`text-xs ${character.visibility === 'ally' ? 'bg-green-900/50 border-green-700 text-green-200' : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                            onClick={() => onAction('setVisibility', character.id, 'ally')}
                                                        >
                                                            Allié
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className={`text-xs ${character.visibility === 'hidden' ? 'bg-red-900/50 border-red-700 text-red-200' : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                            onClick={() => onAction('setVisibility', character.id, 'hidden')}
                                                        >
                                                            Caché
                                                        </Button>
                                                    </div>
                                                </>
                                            )}

                                            {(character.visibility === 'ally' || character.type === 'joueurs') && (
                                                <div className="bg-[#252525] p-2 rounded border border-[#333]">
                                                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                        <span>Rayon Vision</span>
                                                        <span>{Math.round(1 + ((character.visibilityRadius || 100) - 10) / 490 * 29)} cases</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="10"
                                                        max="500"
                                                        value={character.visibilityRadius || 100}
                                                        onChange={(e) => onAction('updateRadius', character.id, parseInt(e.target.value))}
                                                        className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                </div>
                                            )}
                                        </div>


                                    </>
                                )}
                            </div>

                        </div>
                    </ScrollArea>



                </motion.div>
            )}
        </AnimatePresence>
    );
}
