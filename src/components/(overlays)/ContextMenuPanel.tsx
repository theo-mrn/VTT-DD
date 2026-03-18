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
    Dices,
    Grid,
    Square,
    Circle as CircleIcon,
    Package,
    Ghost,
    Minus
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
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
    const avatarInputRef = React.useRef<HTMLInputElement>(null);

    // States for edit and delete dialogs (moved from page.tsx)
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [localEditingCharacter, setLocalEditingCharacter] = useState<Character | null>(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    // State for PV quick-edit drawer
    const [isPVDrawerOpen, setIsPVDrawerOpen] = useState(false);
    const [pvDelta, setPvDelta] = useState(0);

    // State for generic stat-edit drawer (Stats tab)
    const [editingStat, setEditingStat] = useState<{ key: string; label: string; value: number } | null>(null);
    const [statDelta, setStatDelta] = useState(0);

    // 🆕 Sync local state with Firebase data when character changes
    useEffect(() => {
        if (character?.visibleToPlayerIds) {
            setLocalSelectedPlayerIds(character.visibleToPlayerIds);
        } else if (character?.visibility === 'custom') {
            setLocalSelectedPlayerIds([]);
        }
    }, [character?.id, character?.visibleToPlayerIds, character?.visibility]);

    // Reset dialog states when panel closes
    useEffect(() => {
        if (!isOpen) {
            setIsEditDialogOpen(false);
            setLocalEditingCharacter(null);
            setIsDeleteConfirmOpen(false);
            setIsPVDrawerOpen(false);
            setPvDelta(0);
            setEditingStat(null);
            setStatDelta(0);
        }
    }, [isOpen]);

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
                                    <div
                                        className="bg-[#252525]/50 p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-1 group hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                                        onClick={() => { setPvDelta(0); setIsPVDrawerOpen(true); }}
                                    >
                                        <div className="flex items-center gap-1.5 text-gray-400">
                                            <Heart size={12} className="text-red-500" fill="currentColor" />
                                            <span className="text-[10px] uppercase font-bold tracking-wider">PV</span>
                                        </div>
                                        <span className="text-xl font-bold text-gray-100 font-mono leading-none">{character.PV}</span>
                                    </div>
                                    <div
                                        className="bg-[#252525]/50 p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center gap-1 group hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                                        onClick={() => { setStatDelta(0); setEditingStat({ key: 'Defense', label: 'Défense', value: character.Defense ?? 0 }); }}
                                    >
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

                            {/* Interaction Actions (Player View) */}
                            {character.interactions && character.interactions.length > 0 && (
                                <div className="space-y-2">
                                    {character.interactions.map((interaction) => {
                                        const isVendor = interaction.type === 'vendor';
                                        const isGame = interaction.type === 'game';
                                        const isLoot = interaction.type === 'loot';

                                        return (
                                            <Button
                                                key={interaction.id}
                                                className={`w-full h-auto py-3 text-lg font-bold bg-gradient-to-r border shadow-lg group relative overflow-hidden transition-all hover:scale-[1.02] flex flex-col items-start px-4 ${isVendor ? 'from-amber-700 via-amber-600 to-amber-700 border-amber-500/50 hover:border-amber-400 shadow-amber-900/20' :
                                                    isGame ? 'from-purple-700 via-purple-600 to-purple-700 border-purple-500/50 hover:border-purple-400 shadow-purple-900/20' :
                                                        isLoot ? 'from-emerald-700 via-emerald-600 to-emerald-700 border-emerald-500/50 hover:border-emerald-400 shadow-emerald-900/20' :
                                                            'from-blue-700 via-blue-600 to-blue-700 border-blue-500/50 hover:border-blue-400 shadow-blue-900/20'
                                                    } text-white`}
                                                onClick={() => onAction('interact', character.id, interaction.id)}
                                            >
                                                <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" />
                                                <div className={`absolute inset-0 transition-colors ${isVendor ? 'bg-amber-500/0 group-hover:bg-amber-500/10' :
                                                    isGame ? 'bg-purple-500/0 group-hover:bg-purple-500/10' :
                                                        isLoot ? 'bg-emerald-500/0 group-hover:bg-emerald-500/10' :
                                                            'bg-blue-500/0 group-hover:bg-blue-500/10'
                                                    }`} />
                                                <div className="flex items-center w-full relative z-10">
                                                    {isVendor && <Store className="mr-3 h-6 w-6 group-hover:rotate-12 transition-transform shrink-0" />}
                                                    {isGame && <Dices className="mr-3 h-6 w-6 group-hover:rotate-12 transition-transform shrink-0" />}
                                                    {isLoot && <Package className="mr-3 h-6 w-6 group-hover:rotate-12 transition-transform shrink-0" />}
                                                    <span className="truncate">{interaction.name ? interaction.name.toUpperCase() : "INTERAGIR"}</span>
                                                </div>
                                                {interaction.description && (
                                                    <span className="text-xs font-normal opacity-80 pl-9 line-clamp-1 relative z-10 text-left w-full">
                                                        {interaction.description}
                                                    </span>
                                                )}
                                            </Button>
                                        );
                                    })}
                                </div>
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

                                <div className={`relative ${character.type !== 'joueurs' ? 'group/avatar cursor-pointer' : ''}`} onClick={() => { if (character.type !== 'joueurs') avatarInputRef.current?.click(); }}>
                                    <Avatar className={`${!isMJ && character.type !== 'joueurs' ? 'h-24 w-24' : 'h-20 w-20'} border-[3px] border-[#c0a080] shadow-xl ring-4 ring-black/30`}>
                                        <AvatarImage src={typeof character.image === 'object' ? character.image.src : character.image} className="object-cover" />
                                        <AvatarFallback className="bg-[#2a2a2a] text-2xl">{character.name[0]}</AvatarFallback>
                                    </Avatar>
                                    {character.type !== 'joueurs' && (
                                        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
                                            <Edit size={16} className="text-white" />
                                        </div>
                                    )}
                                    {isMJ && hasAudio && (
                                        <div className="absolute -bottom-1 -right-1 bg-purple-600 rounded-full p-1 border-2 border-[#1a1a1a] shadow-sm">
                                            <Music size={10} className="text-white" />
                                        </div>
                                    )}
                                    <input
                                        ref={avatarInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => {
                                                    const img = new window.Image();
                                                    img.onload = () => onAction('updateImage', character.id, img);
                                                    if (typeof ev.target?.result === 'string') img.src = ev.target.result;
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                            e.target.value = '';
                                        }}
                                    />
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
                                <div
                                    className="bg-[#252525]/50 p-2.5 rounded-xl border border-white/5 flex items-center justify-between group hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                                    onClick={() => { setPvDelta(0); setIsPVDrawerOpen(true); }}
                                >
                                    <div className="flex items-center gap-2.5 text-gray-400">
                                        <div className="p-1.5 bg-red-900/20 rounded-md text-red-500 group-hover:bg-red-900/30 transition-colors">
                                            <Heart size={14} fill="currentColor" className="opacity-90" />
                                        </div>
                                        <span className="text-xs font-semibold uppercase tracking-wider">PV</span>
                                    </div>
                                    <span className="text-lg font-bold text-gray-100 font-mono">{character.PV}</span>
                                </div>
                                <div
                                    className="bg-[#252525]/50 p-2.5 rounded-xl border border-white/5 flex items-center justify-between group hover:bg-[#2a2a2a] transition-colors cursor-pointer"
                                    onClick={() => { setStatDelta(0); setEditingStat({ key: 'Defense', label: 'Défense', value: character.Defense ?? 0 }); }}
                                >
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
                                <TabsList className="w-full bg-[#252525]/80 p-1 border border-white/5 grid grid-cols-5">
                                    <TabsTrigger value="actions" className="text-xs data-[state=active]:bg-[#333] data-[state=active]:text-white">Actions</TabsTrigger>
                                    <TabsTrigger value="stats" className="text-xs data-[state=active]:bg-[#333] data-[state=active]:text-white">Stats</TabsTrigger>
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
                                            {/* Players & GM: Interact Buttons */}
                                            {character.interactions && character.interactions.length > 0 && (
                                                <div className="space-y-2">
                                                    {character.interactions.map((interaction) => {
                                                        const isVendor = interaction.type === 'vendor';
                                                        const isGame = interaction.type === 'game';
                                                        const isLoot = interaction.type === 'loot';

                                                        return (
                                                            <Button
                                                                key={interaction.id}
                                                                className={`w-full bg-gradient-to-r border shadow-lg ${isVendor ? 'from-amber-700 to-amber-900 border-amber-500/30 hover:from-amber-600 hover:to-amber-800' :
                                                                    isGame ? 'from-purple-700 to-purple-900 border-purple-500/30 hover:from-purple-600 hover:to-purple-800' :
                                                                        isLoot ? 'from-emerald-700 to-emerald-900 border-emerald-500/30 hover:from-emerald-600 hover:to-emerald-800' :
                                                                            'from-blue-700 to-blue-900 border-blue-500/30 hover:from-blue-600 hover:to-blue-800'
                                                                    } text-white`}
                                                                onClick={() => onAction('interact', character.id, interaction.id)}
                                                            >
                                                                {isVendor && <Store className="mr-2 h-4 w-4" />}
                                                                {isGame && <Dices className="mr-2 h-4 w-4" />}
                                                                {isLoot && <Package className="mr-2 h-4 w-4" />}
                                                                {interaction.name || "Interagir"}
                                                            </Button>
                                                        );
                                                    })}
                                                </div>
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
                                                        ? "Modifier les interactions"
                                                        : "Ajouter une interaction"}
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

                                        {/* Actions de modification/suppression MJ */}
                                        {isMJ && (
                                            <>
                                                <Separator className="bg-white/5" />
                                                <div className="grid grid-cols-2 gap-2 pt-2">
                                                    <Button
                                                        variant="outline"
                                                        className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-yellow-400 text-gray-300 h-9 text-xs"
                                                        onClick={() => {
                                                            setLocalEditingCharacter({ ...character });
                                                            setIsEditDialogOpen(true);
                                                        }}
                                                    >
                                                        <Edit size={14} />
                                                        Modifier
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-red-900/20 hover:border-red-900/50 hover:text-red-400 text-gray-300 h-9 text-xs"
                                                        onClick={() => setIsDeleteConfirmOpen(true)}
                                                    >
                                                        <Trash2 size={14} />
                                                        Supprimer
                                                    </Button>
                                                </div>
                                            </>
                                        )}

                                    </TabsContent>

                                    <TabsContent value="stats" className="mt-0 space-y-4 focus-visible:ring-0">
                                        {/* Caractéristiques */}
                                        <div className="space-y-2">
                                            <h4 className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Caractéristiques</h4>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map((stat) => (
                                                    <div
                                                        key={stat}
                                                        className={`bg-[#252525]/50 rounded-lg border border-white/5 p-2 flex items-center justify-between ${isMJ ? 'cursor-pointer hover:bg-[#2a2a2a] hover:border-[#c0a080]/30 transition-colors' : ''}`}
                                                        onClick={() => isMJ && (() => { setStatDelta(0); setEditingStat({ key: stat, label: stat, value: (character as any)[stat] ?? 0 }); })()}
                                                    >
                                                        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">{stat}</span>
                                                        <span className="text-sm font-bold font-mono text-gray-100">{(character as any)[stat] ?? '—'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Combat */}
                                        <div className="space-y-2">
                                            <h4 className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Combat</h4>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {[
                                                    { key: 'PV', label: 'PV', value: character.PV, max: character.PV_Max, color: 'text-red-400' },
                                                    { key: 'Defense', label: 'Défense', value: character.Defense, color: 'text-blue-400' },
                                                    { key: 'INIT', label: 'Initiative', value: character.INIT, color: 'text-yellow-400' },
                                                    { key: 'niveau', label: 'Niveau', value: character.niveau, color: 'text-purple-400' },
                                                ].map((s) => (
                                                    <div
                                                        key={s.key}
                                                        className={`bg-[#252525]/50 rounded-lg border border-white/5 p-2 flex items-center justify-between ${isMJ ? 'cursor-pointer hover:bg-[#2a2a2a] hover:border-[#c0a080]/30 transition-colors' : ''}`}
                                                        onClick={() => isMJ && (() => { setStatDelta(0); setEditingStat({ key: s.key, label: s.label, value: s.value ?? 0 }); })()}
                                                    >
                                                        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">{s.label}</span>
                                                        <span className={`text-sm font-bold font-mono ${s.color}`}>
                                                            {s.value ?? '—'}{s.max ? ` / ${s.max}` : ''}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Bonus d'attaque */}
                                        <div className="space-y-2">
                                            <h4 className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Bonus d'attaque</h4>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {['Contact', 'Distance', 'Magie'].map((stat) => (
                                                    <div
                                                        key={stat}
                                                        className={`bg-[#252525]/50 rounded-lg border border-white/5 p-2 flex items-center justify-between ${isMJ ? 'cursor-pointer hover:bg-[#2a2a2a] hover:border-[#c0a080]/30 transition-colors' : ''}`}
                                                        onClick={() => isMJ && (() => { setStatDelta(0); setEditingStat({ key: stat, label: stat, value: (character as any)[stat] ?? 0 }); })()}
                                                    >
                                                        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">{stat.slice(0, 4)}</span>
                                                        <span className="text-sm font-bold font-mono text-orange-300">{(character as any)[stat] ?? '—'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
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
                                                <div className="grid grid-cols-3 gap-2">
                                                    {['visible', 'ally', 'hidden', 'custom', 'invisible'].map((mode) => (
                                                        <Button
                                                            key={mode}
                                                            variant="outline"
                                                            size="sm"
                                                            className={`text-xs h-8 capitalize ${character.visibility === mode
                                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                                : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                            onClick={() => onAction('setVisibility', character.id, mode)}
                                                        >
                                                            {mode === 'invisible' ? <><Ghost size={12} className="mr-1" />{mode}</> : mode}
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

            {/* PV Quick-Edit Drawer */}
            <Drawer open={isPVDrawerOpen} onClose={() => setIsPVDrawerOpen(false)}>
                <DrawerContent className="bg-[#1a1a1a] border-t border-[#333] max-w-2xl mx-auto">
                    <DrawerHeader>
                        <DrawerTitle className="text-white text-center text-2xl">Ajuster les PV</DrawerTitle>
                        <DrawerDescription className="text-gray-400 text-center">
                            {character.name} (Actuel: {character.PV})
                        </DrawerDescription>
                    </DrawerHeader>
                    <div className="p-8 flex items-center justify-center gap-8">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-16 w-16 rounded-full border-2 border-[#333] hover:bg-red-500/10 hover:border-red-500 hover:text-red-500 transition-all"
                            onClick={() => setPvDelta(prev => prev - 1)}
                        >
                            <Minus className="h-8 w-8" />
                        </Button>
                        <div className={`text-6xl font-bold font-mono ${pvDelta > 0 ? 'text-green-500' : pvDelta < 0 ? 'text-red-500' : 'text-white'}`}>
                            {pvDelta > 0 ? `+${pvDelta}` : pvDelta}
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-16 w-16 rounded-full border-2 border-[#333] hover:bg-green-500/10 hover:border-green-500 hover:text-green-500 transition-all"
                            onClick={() => setPvDelta(prev => prev + 1)}
                        >
                            <Plus className="h-8 w-8" />
                        </Button>
                    </div>
                    <DrawerFooter className="flex-row justify-center gap-4">
                        <Button variant="outline" className="w-32 border-[#333] text-gray-300 hover:bg-[#252525]" onClick={() => { setIsPVDrawerOpen(false); setPvDelta(0); }}>Annuler</Button>
                        <Button
                            className="w-32 bg-[#c0a080] text-[#1a1a1a] font-bold hover:bg-[#d4b896]"
                            onClick={() => {
                                onAction('updatePV', character.id, (character.PV ?? 0) + pvDelta);
                                setIsPVDrawerOpen(false);
                                setPvDelta(0);
                            }}
                        >
                            Confirmer
                        </Button>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>

            {/* Generic Stat-Edit Drawer (from Stats tab) */}
            <Drawer open={!!editingStat} onClose={() => { setEditingStat(null); setStatDelta(0); }}>
                <DrawerContent className="bg-[#1a1a1a] border-t border-[#333] max-w-2xl mx-auto">
                    <DrawerHeader>
                        <DrawerTitle className="text-white text-center text-2xl">Ajuster : {editingStat?.label}</DrawerTitle>
                        <DrawerDescription className="text-gray-400 text-center">
                            {character.name} (Actuel: {editingStat?.value ?? 0})
                        </DrawerDescription>
                    </DrawerHeader>
                    <div className="p-8 flex items-center justify-center gap-8">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-16 w-16 rounded-full border-2 border-[#333] hover:bg-red-500/10 hover:border-red-500 hover:text-red-500 transition-all"
                            onClick={() => setStatDelta(prev => prev - 1)}
                        >
                            <Minus className="h-8 w-8" />
                        </Button>
                        <div className={`text-6xl font-bold font-mono ${statDelta > 0 ? 'text-green-500' : statDelta < 0 ? 'text-red-500' : 'text-white'}`}>
                            {statDelta > 0 ? `+${statDelta}` : statDelta}
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-16 w-16 rounded-full border-2 border-[#333] hover:bg-green-500/10 hover:border-green-500 hover:text-green-500 transition-all"
                            onClick={() => setStatDelta(prev => prev + 1)}
                        >
                            <Plus className="h-8 w-8" />
                        </Button>
                    </div>
                    <DrawerFooter className="flex-row justify-center gap-4">
                        <Button variant="outline" className="w-32 border-[#333] text-gray-300 hover:bg-[#252525]" onClick={() => { setEditingStat(null); setStatDelta(0); }}>Annuler</Button>
                        <Button
                            className="w-32 bg-[#c0a080] text-[#1a1a1a] font-bold hover:bg-[#d4b896]"
                            onClick={() => {
                                if (editingStat) {
                                    onAction('updateStat', character.id, { key: editingStat.key, value: editingStat.value + statDelta });
                                    setEditingStat(null);
                                    setStatDelta(0);
                                }
                            }}
                        >
                            Confirmer
                        </Button>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>

            {/* Edit Character Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
                setIsEditDialogOpen(open);
                if (!open) setLocalEditingCharacter(null);
            }}>
                <DialogContent className="bg-[rgb(36,36,36)] text-[#c0a080] max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Modifier le personnage</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-auto max-h-[85vh] pr-4">
                        <div className="space-y-6 py-4">

                            {/* --- SECTION 1: GÉNÉRAL --- */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-1">Général</h3>
                                <div className="space-y-1.5">
                                    <Label htmlFor="characterName" className="text-xs text-gray-300">Nom du personnage</Label>
                                    <Input
                                        id="characterName"
                                        value={localEditingCharacter?.name || ''}
                                        onChange={(e) => localEditingCharacter && setLocalEditingCharacter({ ...localEditingCharacter, name: e.target.value })}
                                        className="bg-[#2a2a2a] border-gray-600 focus:border-[#c0a080]"
                                    />
                                </div>
                            </div>

                            {/* --- SECTION 2: COMBAT & VITALITÉ --- */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-1">Combat & Vitalité</h3>
                                <div className="grid grid-cols-4 gap-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="PV" className="text-[10px] uppercase text-gray-400">PV Actuels</Label>
                                        <Input
                                            id="PV"
                                            type="number"
                                            value={localEditingCharacter?.PV || 0}
                                            onChange={(e) => localEditingCharacter && setLocalEditingCharacter({ ...localEditingCharacter, PV: parseInt(e.target.value) || 0 })}
                                            className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="PV_Max" className="text-[10px] uppercase text-gray-400">PV Max</Label>
                                        <Input
                                            id="PV_Max"
                                            type="number"
                                            value={localEditingCharacter?.PV_Max || localEditingCharacter?.PV || 0}
                                            onChange={(e) => localEditingCharacter && setLocalEditingCharacter({ ...localEditingCharacter, PV_Max: parseInt(e.target.value) || 0 })}
                                            className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="Defense" className="text-[10px] uppercase text-gray-400">Défense</Label>
                                        <Input
                                            id="Defense"
                                            type="number"
                                            value={localEditingCharacter?.Defense || 0}
                                            onChange={(e) => localEditingCharacter && setLocalEditingCharacter({ ...localEditingCharacter, Defense: parseInt(e.target.value) || 0 })}
                                            className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="INIT" className="text-[10px] uppercase text-gray-400">Initiative</Label>
                                        <Input
                                            id="INIT"
                                            type="number"
                                            value={localEditingCharacter?.INIT || 0}
                                            onChange={(e) => localEditingCharacter && setLocalEditingCharacter({ ...localEditingCharacter, INIT: parseInt(e.target.value) || 0 })}
                                            className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="niveau" className="text-[10px] uppercase text-gray-400">Niveau</Label>
                                        <Input
                                            id="niveau"
                                            type="number"
                                            value={localEditingCharacter?.niveau || 1}
                                            onChange={(e) => localEditingCharacter && setLocalEditingCharacter({ ...localEditingCharacter, niveau: parseInt(e.target.value) || 1 })}
                                            className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* --- SECTION 3: BONUS D'ATTAQUE --- */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-1">Bonus d'Attaque</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    {['Contact', 'Distance', 'Magie'].map((stat) => (
                                        <div key={stat} className="space-y-1">
                                            <Label htmlFor={stat} className="text-[10px] uppercase text-gray-400">{stat}</Label>
                                            <Input
                                                id={stat}
                                                type="number"
                                                value={localEditingCharacter?.[stat as keyof Character] as number || 0}
                                                onChange={(e) => localEditingCharacter && setLocalEditingCharacter({ ...localEditingCharacter, [stat]: parseInt(e.target.value) || 0 })}
                                                className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* --- SECTION 4: CARACTÉRISTIQUES --- */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-1">Caractéristiques</h3>
                                <div className="grid grid-cols-6 gap-2">
                                    {['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map((stat) => (
                                        <div key={stat} className="space-y-1 text-center">
                                            <Label htmlFor={stat} className="text-[10px] uppercase text-gray-400 block">{stat}</Label>
                                            <Input
                                                id={stat}
                                                type="number"
                                                value={localEditingCharacter?.[stat as keyof Character] as number || 0}
                                                onChange={(e) => localEditingCharacter && setLocalEditingCharacter({ ...localEditingCharacter, [stat]: parseInt(e.target.value) || 0 })}
                                                className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono px-1"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>


                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button onClick={() => {
                            if (localEditingCharacter) {
                                onAction('edit', character.id, localEditingCharacter);
                                setIsEditDialogOpen(false);
                                setLocalEditingCharacter(null);
                            }
                        }}>Modifier</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                <DialogContent className="bg-[rgb(36,36,36)] text-[#c0a080] max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Confirmer la suppression</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <p>Êtes-vous sûr de vouloir supprimer le personnage {character.name} ? Cette action est irréversible.</p>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setIsDeleteConfirmOpen(false)}>Annuler</Button>
                        <Button onClick={() => {
                            onAction('delete', character.id);
                            setIsDeleteConfirmOpen(false);
                        }}>Supprimer</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
