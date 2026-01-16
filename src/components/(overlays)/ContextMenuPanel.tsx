"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
    Shield,
    Heart,
    Sword,
    Trash2,
    Edit,
    FileText,
    X,
    Sparkles,
    Plus,
    Check,
    Music,
    Volume2,
    VolumeX,
    Settings,
    Store,
    Grid,
    Square,
    Circle as CircleIcon
} from 'lucide-react';
import { CONDITIONS } from '@/components/(combat)/MJcombat';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Character } from '@/app/[roomid]/map/types';
import { CharacterAudioDialog } from '@/components/(dialogs)/CharacterAudioDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityNotes } from './EntityNotes';

interface ContextMenuPanelProps {
    character: Character | null;
    isOpen: boolean;
    onClose: () => void;
    onAction: (action: string, characterId: string, value?: any) => void;
    isMJ: boolean;
    players: Character[]; // 🆕 Liste des joueurs pour la sélection custom
    onUploadFile?: (file: File) => Promise<string>; // New prop for uploads
    pixelsPerUnit: number; // 🆕 For meter-based calculations
    unitName: string; // 🆕 Unit name (e.g., 'm', 'ft')
}

export default function ContextMenuPanel({
    character,
    isOpen,
    onClose,
    onAction,
    isMJ,
    players,
    onUploadFile,
    pixelsPerUnit,
    unitName
}: ContextMenuPanelProps) {
    const dragControls = useDragControls();
    const [customCondition, setCustomCondition] = useState("");
    // 🆕 State local pour feedback visuel immédiat de la sélection de joueurs
    const [localSelectedPlayerIds, setLocalSelectedPlayerIds] = useState<string[]>([]);

    // Internal state for embedded audio dialog
    const [isAudioDialogOpen, setIsAudioDialogOpen] = useState(false);

    // 🆕 Sync local state with Firebase data when character changes
    useEffect(() => {
        if (character?.visibleToPlayerIds) {
            setLocalSelectedPlayerIds(character.visibleToPlayerIds);
        } else if (character?.visibility === 'custom') {
            setLocalSelectedPlayerIds([]);
        }
    }, [character?.id, character?.visibleToPlayerIds, character?.visibility]);

    if (!character) return null;

    // Determine if the user allows to see detailed info (Stats, Sheet, details)
    // Visible for GM, Allies, or other Players
    const canViewDetails = isMJ || character.visibility === 'ally' || character.type === 'joueurs';

    const hasAudio = !!character.audio?.url;

    // 🆕 PLAYER VIEW (Simplified)
    if (!isMJ) {
        return (
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        drag
                        dragControls={dragControls}
                        dragListener={false}
                        dragMomentum={false}
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="fixed right-20 top-20 w-[280px] bg-[#1a1a1a]/95 backdrop-blur-xl border border-[#333] rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden ring-1 ring-white/5"
                    >
                        {/* Draggable Header with Large Image */}
                        <div
                            className="relative h-80 w-full cursor-move group"
                            onPointerDown={(e) => dragControls.start(e)}
                        >
                            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent z-10" />
                            {character.image && (
                                <img
                                    src={typeof character.image === 'object' ? character.image.src : character.image}
                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    alt={character.name}
                                />
                            )}

                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 z-20 h-8 w-8 text-white/70 hover:text-white hover:bg-black/40 rounded-full backdrop-blur-sm"
                                onClick={onClose}
                            >
                                <X size={18} />
                            </Button>

                            <div className="absolute bottom-0 left-0 right-0 p-4 z-20">
                                <h2 className="text-2xl font-bold text-white font-serif tracking-wide text-shadow-lg leading-none mb-1">{character.name}</h2>
                                <div className="flex gap-2">
                                    <Badge variant="outline" className="bg-black/40 text-gray-300 border-white/10 backdrop-blur-md text-[10px] px-2 h-5">
                                        {character.type === 'joueurs' ? 'Joueur' : 'PNJ'}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="p-4 space-y-4">
                            {/* Stats Row */}
                            {canViewDetails && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-[#252525]/50 p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-1 group hover:bg-[#2a2a2a] transition-colors">
                                        <div className="flex items-center gap-1.5 text-gray-400">
                                            <Heart size={12} className="text-red-500" fill="currentColor" />
                                            <span className="text-[10px] uppercase font-bold tracking-wider">PV</span>
                                        </div>
                                        <span className="text-xl font-bold text-gray-100 font-mono leading-none">{character.PV}</span>
                                    </div>
                                    <div className="bg-[#252525]/50 p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-1 group hover:bg-[#2a2a2a] transition-colors">
                                        <div className="flex items-center gap-1.5 text-gray-400">
                                            <Shield size={12} className="text-blue-500" fill="currentColor" />
                                            <span className="text-[10px] uppercase font-bold tracking-wider">DEF</span>
                                        </div>
                                        <span className="text-xl font-bold text-gray-100 font-mono leading-none">{character.Defense}</span>
                                    </div>
                                </div>
                            )}

                            {/* Main Action: ATTACK */}
                            <Button
                                className="w-full h-14 text-lg font-bold bg-gradient-to-r from-red-900 via-red-800 to-red-900 border border-red-700/50 hover:border-red-500 text-red-100 shadow-lg shadow-red-900/20 group relative overflow-hidden transition-all hover:scale-[1.02]"
                                onClick={() => onAction('attack', character.id)}
                            >
                                <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" />
                                <div className="absolute inset-0 bg-red-500/0 group-hover:bg-red-500/10 transition-colors" />
                                <Sword className="mr-3 h-6 w-6 group-hover:rotate-12 transition-transform" />
                                ATTAQUER
                            </Button>

                            {/* Interaction Action (Player View) */}
                            {character.interactions && character.interactions.length > 0 && (
                                <Button
                                    className="w-full h-14 text-lg font-bold bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700 border border-amber-500/50 hover:border-amber-400 text-white shadow-lg shadow-amber-900/20 group relative overflow-hidden transition-all hover:scale-[1.02]"
                                    onClick={() => onAction('interact', character.id, character.interactions?.[0]?.id)}
                                >
                                    <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" />
                                    <div className="absolute inset-0 bg-amber-500/0 group-hover:bg-amber-500/10 transition-colors" />
                                    <Store className="mr-3 h-6 w-6 group-hover:rotate-12 transition-transform" />
                                    {character.interactions[0].name ? character.interactions[0].name.toUpperCase() : "INTERAGIR"}
                                </Button>
                            )}

                            {/* Secondary Actions */}
                            {canViewDetails && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full h-9 text-xs text-gray-400 hover:text-white hover:bg-[#252525] border border-transparent hover:border-white/5"
                                    onClick={() => onAction('openSheet', character.id)}
                                >
                                    <FileText size={14} className="mr-2" />
                                    Voir la fiche de personnage
                                </Button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }

    // 🛡️ MJ VIEW (Full)
    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        drag
                        dragControls={dragControls}
                        dragListener={false}
                        dragMomentum={false}
                        initial={{ scale: 0.95, opacity: 0, y: 10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 10 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        className="fixed right-20 top-20 max-h-[85vh] w-[340px] bg-[#1a1a1a]/90 backdrop-blur-xl border border-[#333] rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden ring-1 ring-white/5"
                    >
                        {/* Header avec Image et Nom - Draggable Zone */}
                        <div
                            className="relative cursor-move shrink-0"
                            onPointerDown={(e) => dragControls.start(e)}
                        >
                            {/* Background Image Floutée avec Gradient */}
                            <div className="absolute inset-0 z-0 overflow-hidden h-32">
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#1a1a1a]" />
                                <div className="absolute inset-0 bg-black/40" />
                                {character.image && (
                                    <img
                                        src={typeof character.image === 'object' ? character.image.src : character.image}
                                        className="w-full h-full object-cover blur opacity-50"
                                        alt=""
                                    />
                                )}
                            </div>

                            <div className="relative z-10 p-4 pt-6 flex flex-col items-center gap-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-2 right-2 h-7 w-7 text-white/50 hover:text-white hover:bg-white/10 rounded-full"
                                    onClick={onClose}
                                >
                                    <X size={16} />
                                </Button>

                                <div className="relative">
                                    <Avatar className={`${!isMJ && character.type !== 'joueurs' ? 'h-24 w-24' : 'h-20 w-20'} border-[3px] border-[#c0a080] shadow-xl ring-4 ring-black/30`}>
                                        <AvatarImage src={typeof character.image === 'object' ? character.image.src : character.image} className="object-cover" />
                                        <AvatarFallback className="bg-[#2a2a2a] text-2xl">{character.name[0]}</AvatarFallback>
                                    </Avatar>
                                    {isMJ && hasAudio && (
                                        <div className="absolute -bottom-1 -right-1 bg-purple-600 rounded-full p-1 border-2 border-[#1a1a1a] shadow-sm">
                                            <Music size={10} className="text-white" />
                                        </div>
                                    )}
                                </div>

                                <div className="text-center w-full">
                                    <h2 className="text-xl font-bold text-white font-serif tracking-wide truncate px-2 text-shadow-sm">{character.name}</h2>
                                    <div className="flex gap-2 justify-center mt-2 flex-wrap">
                                        {canViewDetails && (
                                            <Badge variant="outline" className="bg-black/30 text-gray-300 border-white/10 backdrop-blur-md">Niv {character.niveau}</Badge>
                                        )}
                                        <Badge variant={character.type === 'joueurs' ? "default" : "secondary"} className={character.type === 'joueurs' ? "bg-blue-600/80 hover:bg-blue-600" : "bg-orange-600/80 hover:bg-orange-600"}>
                                            {character.type === 'joueurs' ? 'Joueur' : 'PNJ'}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stats Rapides Bar */}
                        {canViewDetails && (
                            <div className="grid grid-cols-2 gap-1 px-4 pb-4 shrink-0">
                                <div className="bg-[#252525]/50 p-2.5 rounded-xl border border-white/5 flex items-center justify-between group hover:bg-[#2a2a2a] transition-colors">
                                    <div className="flex items-center gap-2.5 text-gray-400">
                                        <div className="p-1.5 bg-red-900/20 rounded-md text-red-500 group-hover:bg-red-900/30 transition-colors">
                                            <Heart size={14} fill="currentColor" className="opacity-90" />
                                        </div>
                                        <span className="text-xs font-semibold uppercase tracking-wider">PV</span>
                                    </div>
                                    <span className="text-lg font-bold text-gray-100 font-mono">{character.PV}</span>
                                </div>
                                <div className="bg-[#252525]/50 p-2.5 rounded-xl border border-white/5 flex items-center justify-between group hover:bg-[#2a2a2a] transition-colors">
                                    <div className="flex items-center gap-2.5 text-gray-400">
                                        <div className="p-1.5 bg-blue-900/20 rounded-md text-blue-500 group-hover:bg-blue-900/30 transition-colors">
                                            <Shield size={14} fill="currentColor" className="opacity-90" />
                                        </div>
                                        <span className="text-xs font-semibold uppercase tracking-wider">DEF</span>
                                    </div>
                                    <span className="text-lg font-bold text-gray-100 font-mono">{character.Defense}</span>
                                </div>
                            </div>
                        )}

                        <Tabs defaultValue="actions" className="flex-1 flex flex-col min-h-0 w-full">
                            <div className="px-4 pb-2">
                                <TabsList className="w-full bg-[#252525]/80 p-1 border border-white/5 grid grid-cols-4">
                                    <TabsTrigger value="actions" className="text-xs data-[state=active]:bg-[#333] data-[state=active]:text-white">Actions</TabsTrigger>
                                    <TabsTrigger value="effects" className="text-xs data-[state=active]:bg-[#333] data-[state=active]:text-white">Effets</TabsTrigger>
                                    <TabsTrigger value="params" className="text-xs data-[state=active]:bg-[#333] data-[state=active]:text-white" disabled={!isMJ}>Param</TabsTrigger>
                                    <TabsTrigger value="notes" className="text-xs data-[state=active]:bg-[#333] data-[state=active]:text-white">Notes</TabsTrigger>
                                </TabsList>
                            </div>

                            <ScrollArea className="flex-1 w-full bg-[#111]/30">
                                <div className="p-4 space-y-4">

                                    <TabsContent value="actions" className="mt-0 space-y-3 focus-visible:ring-0">
                                        {/* Action Buttons */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="outline"
                                                className="justify-start gap-2 bg-[#252525] border-white/5 hover:bg-[#333] hover:text-red-400 text-gray-300 h-10"
                                                onClick={() => onAction('attack', character.id)}
                                            >
                                                <Sword size={16} />
                                                Attaquer
                                            </Button>
                                            {canViewDetails && (
                                                <Button
                                                    variant="outline"
                                                    className="justify-start gap-2 bg-[#252525] border-white/5 hover:bg-[#333] hover:text-[#c0a080] text-gray-300 h-10"
                                                    onClick={() => onAction('openSheet', character.id)}
                                                >
                                                    <FileText size={16} />
                                                    Fiche
                                                </Button>
                                            )}
                                        </div>

                                        {/* Interaction Section */}
                                        <div className="space-y-2">
                                            {/* Players: Interact Button */}
                                            {character.interactions && character.interactions.length > 0 && (
                                                <Button
                                                    className="w-full bg-gradient-to-r from-amber-700 to-amber-900 border border-amber-500/30 hover:from-amber-600 hover:to-amber-800 text-white shadow-lg"
                                                    onClick={() => onAction('interact', character.id, character.interactions?.[0]?.id)}
                                                >
                                                    <Store className="mr-2 h-4 w-4" />
                                                    {character.interactions[0].name || "Interagir"}
                                                </Button>
                                            )}

                                            {/* GM: Add/Edit Interaction */}
                                            {isMJ && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full h-8 text-xs border-dashed border-white/20 text-gray-400 hover:text-white hover:bg-white/5"
                                                    onClick={() => onAction('configureInteraction', character.id)}
                                                >
                                                    <Plus className="mr-1 h-3 w-3" />
                                                    {character.interactions && character.interactions.length > 0
                                                        ? "Modifier l'interaction"
                                                        : "Ajouter une interaction (Vendeur)"}
                                                </Button>
                                            )}
                                        </div>

                                        {/* Quick Audio Control for GM */}
                                        {isMJ && (
                                            <div className="bg-[#202020] rounded-lg p-3 border border-dashed border-white/10 hover:border-purple-500/30 transition-colors">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <Music size={14} className="text-purple-400" />
                                                        <span className="text-xs font-medium text-gray-400">Audio d'ambiance</span>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-6 w-6 p-0 hover:bg-purple-900/30 hover:text-purple-300"
                                                        onClick={() => setIsAudioDialogOpen(true)}
                                                    >
                                                        <Settings size={12} />
                                                    </Button>
                                                </div>

                                                {hasAudio ? (
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            className="flex-1 bg-purple-900/20 hover:bg-purple-900/40 text-purple-200 border border-purple-500/30 h-8 text-xs gap-2"
                                                            onClick={() => onAction('toggleAudioPlay', character.id)} // This needs to be handled in page OR just assume saving enables loop
                                                        >
                                                            {character.audio?.volume !== 0 ? <Volume2 size={12} /> : <VolumeX size={12} />}
                                                            {character.audio?.name || "Audio Configuré"}
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button
                                                        className="w-full bg-[#2a2a2a] hover:bg-[#333] text-gray-400 border border-transparent hover:border-purple-500/30 h-8 text-xs gap-2"
                                                        onClick={() => setIsAudioDialogOpen(true)}
                                                    >
                                                        <Plus size={12} />
                                                        Ajouter un son
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </TabsContent>

                                    <TabsContent value="effects" className="mt-0 focus-visible:ring-0">
                                        {isMJ ? (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-2">
                                                    {CONDITIONS.map((condition) => {
                                                        const isActive = character.conditions?.includes(condition.id);
                                                        const Icon = condition.icon;
                                                        return (
                                                            <Button
                                                                key={condition.id}
                                                                variant="outline"
                                                                size="sm"
                                                                className={`justify-start gap-2 h-9 text-xs transition-all ${isActive ? 'bg-blue-900/40 border-blue-500/50 text-blue-200' : 'bg-[#252525] border-[#333] text-gray-400 hover:text-white hover:bg-[#333]'}`}
                                                                onClick={() => onAction('toggleCondition', character.id, condition.id)}
                                                            >
                                                                <Icon size={14} className={isActive ? condition.color : ""} />
                                                                {condition.label}
                                                            </Button>
                                                        );
                                                    })}
                                                </div>

                                                {/* Custom Conditions */}
                                                <div className="space-y-2">
                                                    <div className="flex gap-2">
                                                        <Input
                                                            value={customCondition}
                                                            onChange={(e) => setCustomCondition(e.target.value)}
                                                            placeholder="Autre effet..."
                                                            className="h-8 text-xs bg-[#252525] border-[#333] focus:border-blue-500/50"
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
                                                            className="h-8 w-8 p-0 hover:bg-[#333]"
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

                                                    {character.conditions && character.conditions.some(c => !CONDITIONS.some(cond => cond.id === c)) && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {character.conditions.map(c => {
                                                                const isPredefined = CONDITIONS.some(cond => cond.id === c);
                                                                if (isPredefined) return null;

                                                                return (
                                                                    <Badge
                                                                        key={c}
                                                                        variant="secondary"
                                                                        className="bg-blue-900/20 text-blue-200 border-blue-500/20 hover:bg-red-900/30 hover:border-red-500/30 hover:text-red-200 cursor-pointer gap-1 pl-2 pr-1 h-6 transition-colors"
                                                                        onClick={() => onAction('toggleCondition', character.id, c)}
                                                                    >
                                                                        <Sparkles size={10} className="text-purple-400" />
                                                                        {c}
                                                                        <X size={12} className="ml-1 opacity-50" />
                                                                    </Badge>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center text-gray-500 text-xs py-8">
                                                Seul le MJ peut gérer les effets.
                                            </div>
                                        )}
                                    </TabsContent>

                                    <TabsContent value="params" className="mt-0 space-y-4 focus-visible:ring-0">
                                        {character.type !== 'joueurs' && (
                                            <div className="space-y-3">
                                                <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Visibilité</h3>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {['visible', 'ally', 'hidden', 'custom'].map((mode) => (
                                                        <Button
                                                            key={mode}
                                                            variant="outline"
                                                            size="sm"
                                                            className={`text-xs h-8 capitalize ${character.visibility === mode
                                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                                : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                            onClick={() => onAction('setVisibility', character.id, mode)}
                                                        >
                                                            {mode}
                                                        </Button>
                                                    ))}
                                                </div>

                                                {/* Custom Player Selection */}
                                                {character.visibility === 'custom' && (
                                                    <div className="bg-[#1a1a1a] p-2 rounded-lg border border-[#444] space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
                                                        {players.length === 0 ? (
                                                            <p className="text-xs text-gray-500 italic text-center py-2">Aucun joueur</p>
                                                        ) : (
                                                            players.map(player => {
                                                                const isSelected = localSelectedPlayerIds.includes(player.id);
                                                                return (
                                                                    <div
                                                                        key={player.id}
                                                                        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-all ${isSelected ? 'bg-purple-900/40 border border-purple-500/30' : 'hover:bg-[#252525] border border-transparent'}`}
                                                                        onClick={() => {
                                                                            const currentIds = localSelectedPlayerIds;
                                                                            const newIds = isSelected
                                                                                ? currentIds.filter(id => id !== player.id)
                                                                                : [...currentIds, player.id];
                                                                            setLocalSelectedPlayerIds(newIds);
                                                                            onAction('updateVisiblePlayers', character.id, newIds);
                                                                        }}
                                                                    >
                                                                        <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-600 bg-transparent'}`}>
                                                                            {isSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                                                                        </div>
                                                                        <span className="text-xs text-gray-300 truncate">{player.name}</span>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <Separator className="bg-white/5" />
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-gray-400">Forme</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`text-xs h-8 ${!character.shape || character.shape === 'circle'
                                                        ? 'bg-blue-600 border-blue-500 text-white'
                                                        : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                    onClick={() => onAction('updateShape', character.id, 'circle')}
                                                >
                                                    <CircleIcon size={14} className="mr-2" />
                                                    Rond
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`text-xs h-8 ${character.shape === 'square'
                                                        ? 'bg-blue-600 border-blue-500 text-white'
                                                        : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                    onClick={() => onAction('updateShape', character.id, 'square')}
                                                >
                                                    <Square size={14} className="mr-2" />
                                                    Carré
                                                </Button>
                                            </div>
                                        </div>

                                        <Separator className="bg-white/5" />

                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-gray-400">Taille</span>
                                                <span className="text-xs font-mono text-gray-300">x{character.scale || 1}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.5"
                                                max="3"
                                                step="0.1"
                                                value={character.scale || 1}
                                                onChange={(e) => onAction('updateScale', character.id, parseFloat(e.target.value))}
                                                className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-blue-500"
                                            />
                                        </div>

                                        {/* Vision Radius Control for Players and Allies */}
                                        {(character.type === 'joueurs' || character.visibility === 'ally') && (
                                            <>
                                                <Separator className="bg-white/5" />

                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-gray-400">Rayon de vision</span>
                                                        <div className="flex gap-2 items-center">
                                                            <span className="text-xs font-mono text-[#c0a080]" title={`Valeur brute: ${character.visibilityRadius}`}>
                                                                {Math.round(1 + ((character.visibilityRadius || 100) - 10) / 490 * 29)} c.
                                                            </span>
                                                            <span className="text-[10px] text-gray-500">•</span>
                                                            <span className="text-xs font-mono text-blue-400">
                                                                {((character.visibilityRadius || 100) / pixelsPerUnit).toFixed(1)} {unitName}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="10"
                                                        max="500"
                                                        step="10"
                                                        value={character.visibilityRadius || 100}
                                                        onChange={(e) => onAction('updateVisibilityRadius', character.id, parseInt(e.target.value))}
                                                        className="w-full h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer accent-[#c0a080]"
                                                    />
                                                </div>

                                            </>
                                        )}

                                        {(
                                            <>
                                                <Separator className="bg-white/5" />
                                                <div className="grid grid-cols-2 gap-2 pt-2">
                                                    <Button
                                                        variant="outline"
                                                        className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-yellow-400 text-gray-300 h-9 text-xs"
                                                        onClick={() => onAction('edit', character.id)}
                                                    >
                                                        <Edit size={14} />
                                                        Modifier
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-red-900/20 hover:border-red-900/50 hover:text-red-400 text-gray-300 h-9 text-xs"
                                                        onClick={() => {
                                                            onAction('delete', character.id);
                                                        }}
                                                    >
                                                        <Trash2 size={14} />
                                                        Supprimer
                                                    </Button>
                                                </div>
                                            </>
                                        )}

                                    </TabsContent>

                                    <TabsContent value="notes" className="mt-0 pt-2 focus-visible:ring-0">
                                        <EntityNotes
                                            initialNotes={character.notes}
                                            onSave={(notes) => onAction('updateNotes', character.id, notes)}
                                            isReadOnly={!isMJ && character.type !== 'joueurs'}
                                        />
                                    </TabsContent>

                                </div>
                            </ScrollArea>
                        </Tabs>
                    </motion.div>
                )}
            </AnimatePresence >

            {/* Embedded Audio Dialog */}
            < CharacterAudioDialog
                isOpen={isAudioDialogOpen}
                onClose={() => setIsAudioDialogOpen(false)
                }
                character={character}
                onUpload={onUploadFile}
                onSave={async (audioData) => {
                    onAction('updateCharacterAudio', character.id, audioData);
                }}
                onDelete={async () => {
                    onAction('deleteCharacterAudio', character.id);
                }}
            />
        </>
    );
}
