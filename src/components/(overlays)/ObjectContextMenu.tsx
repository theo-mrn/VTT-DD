"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
    Trash2,
    X,
    Lock,
    Unlock,
    Image as ImageIcon,
    Eye,
    EyeOff,
    Check,
    RotateCw,
    Edit2,
    Package,
    Ghost
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from '@/components/ui/input';
import { MapObject, Character } from '@/app/[roomid]/map/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityNotes } from './EntityNotes';

interface ObjectContextMenuProps {
    object: MapObject | null;
    isOpen: boolean;
    onClose: () => void;
    onAction: (action: string, objectId: string, value?: any) => void;
    isMJ: boolean;
    isBackgroundEditMode: boolean;
    players: Character[]; // 🆕 Liste des joueurs pour la sélection custom
}

export default function ObjectContextMenu({
    object,
    isOpen,
    onClose,
    onAction,
    isMJ,
    isBackgroundEditMode,
    players
}: ObjectContextMenuProps) {
    const dragControls = useDragControls();

    const [rotation, setRotation] = useState(object?.rotation || 0);

    // Local state for renaming
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");

    useEffect(() => {
        if (isOpen && object) {
            setRotation(object.rotation || 0);
            setRenameValue(object.name || "");
            setIsRenaming(false);
        }
    }, [isOpen, object]);

    if (!object) return null;

    const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newRotation = parseInt(e.target.value);
        setRotation(newRotation);
        onAction('rotate', object.id, newRotation);
    };

    const handleRenameSubmit = () => {
        onAction('rename', object.id, renameValue);
        setIsRenaming(false);
    };

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
                    className="fixed right-24 top-24 w-72 bg-[#1e1e1e]/95 backdrop-blur-md border border-[#333] rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
                >
                    {/* Header avec Image */}
                    <div
                        className={`relative ${isMJ ? 'cursor-move' : ''} ${isMJ ? 'h-32' : 'h-48'}`}
                        onPointerDown={(e) => isMJ && dragControls.start(e)}
                    >
                        {/* Background Image Floutée */}
                        <div className="absolute inset-0 bg-[#000] flex items-center justify-center overflow-hidden">
                            {object.imageUrl ? (
                                <img
                                    src={object.imageUrl}
                                    className="w-full h-full object-contain opacity-80"
                                    alt="Objet"
                                />
                            ) : (
                                <ImageIcon className="text-gray-600 w-12 h-12" />
                            )}
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-6 w-6 bg-black/50 hover:bg-black/70 text-white rounded-full z-20"
                            onClick={onClose}
                        >
                            <X size={14} />
                        </Button>
                    </div>

                    <Separator className="bg-[#333]" />

                    {/* Object Name - visible to all, editable by MJ */}
                    <div className="p-4 pb-2">
                        {isRenaming && isMJ ? (
                            <div className="flex items-center gap-2">
                                <Input
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    className="bg-[#252525] border-[#404040] text-center font-bold text-[#e0e0e0]"
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
                                />
                                <Button size="icon" variant="ghost" onClick={handleRenameSubmit} className="hover:text-green-400">
                                    <Check size={16} />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setIsRenaming(false)} className="hover:text-red-400">
                                    <X size={16} />
                                </Button>
                            </div>
                        ) : (
                            <div className="group relative flex justify-center items-center gap-2">
                                <h2 className="text-xl font-bold text-[#e0e0e0] font-serif tracking-wide text-center">{object.name || 'Objet'}</h2>
                                {isMJ && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-white"
                                        onClick={() => {
                                            setRenameValue(object.name || "");
                                            setIsRenaming(true);
                                        }}
                                    >
                                        <Edit2 size={14} />
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>

                    <Tabs defaultValue="actions" className="flex-1 flex flex-col min-h-0 w-full">
                        <div className="px-4 pb-2">
                            <TabsList className="w-full bg-[#252525]/80 p-1 border border-white/5 grid grid-cols-2">
                                <TabsTrigger value="actions" className="text-xs data-[state=active]:bg-[#333] data-[state=active]:text-white">Général</TabsTrigger>
                                <TabsTrigger value="notes" className="text-xs data-[state=active]:bg-[#333] data-[state=active]:text-white">Notes</TabsTrigger>
                            </TabsList>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-4">
                                <TabsContent value="actions" className="mt-0 space-y-4 focus-visible:ring-0">
                                    {isMJ && <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Actions Objet</h3>}

                                    <div className="grid grid-cols-1 gap-2">
                                        <Button
                                            variant="outline"
                                            className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-amber-400 text-gray-300"
                                            onClick={() => onAction('openLoot', object.id)}
                                        >
                                            <Package size={16} />
                                            Fouiller
                                        </Button>

                                        {isMJ && (
                                            <>
                                                {/* Lock / Unlock Object */}
                                                <Button
                                                    variant="outline"
                                                    className={`justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] text-gray-300 ${object.isLocked ? 'hover:text-green-400' : 'hover:text-orange-400'}`}
                                                    onClick={() => onAction('toggleLock', object.id)}
                                                >
                                                    {object.isLocked ? <Unlock size={16} /> : <Lock size={16} />}
                                                    {object.isLocked ? 'Déverrouiller' : 'Verrouiller pour joueurs'}
                                                </Button>

                                                {/* Lock / Unlock Background */}
                                                {!object.isBackground && (
                                                    <Button
                                                        variant="outline"
                                                        className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-blue-400 text-gray-300"
                                                        onClick={() => onAction('toggleBackground', object.id)}
                                                    >
                                                        <Lock size={16} />
                                                        Incruster dans le fond
                                                    </Button>
                                                )}

                                                {object.isBackground && isBackgroundEditMode && (
                                                    <Button
                                                        variant="outline"
                                                        className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-green-400 text-gray-300"
                                                        onClick={() => onAction('toggleBackground', object.id)}
                                                    >
                                                        <Unlock size={16} />
                                                        Libérer l'objet
                                                    </Button>
                                                )}

                                                <Button
                                                    variant="outline"
                                                    className="justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-red-600 text-gray-300"
                                                    onClick={() => onAction('delete', object.id)}
                                                >
                                                    <Trash2 size={16} />
                                                    Supprimer
                                                </Button>
                                            </>
                                        )}
                                    </div>

                                    {/* Size Control */}
                                    {isMJ && (
                                        <div className="mt-4 space-y-2">
                                            <div className="bg-[#252525] p-2 rounded border border-[#333]">
                                                <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                    <span>Rotation</span>
                                                    <span>{Math.round(rotation || 0)}°</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="360"
                                                    step="5"
                                                    value={rotation}
                                                    onChange={handleRotationChange}
                                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* 🆕 Visibility Controls for Objects */}
                                    {isMJ && (
                                        <div className="mt-4 space-y-2">
                                            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Visibilité</h3>

                                            <div className="grid grid-cols-4 gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`text-xs ${(!object.visibility || object.visibility === 'visible') ? 'bg-green-900/50 border-green-700 text-green-200' : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                    onClick={() => onAction('setObjectVisibility', object.id, 'visible')}
                                                >
                                                    <Eye size={12} className="mr-1" />
                                                    Visible
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`text-xs ${object.visibility === 'hidden' ? 'bg-red-900/50 border-red-700 text-red-200' : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                    onClick={() => onAction('setObjectVisibility', object.id, 'hidden')}
                                                >
                                                    <EyeOff size={12} className="mr-1" />
                                                    Caché
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`text-xs ${object.visibility === 'custom' ? 'bg-purple-900/50 border-purple-700 text-purple-200' : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                    onClick={() => onAction('setObjectVisibility', object.id, 'custom')}
                                                >
                                                    Custom
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className={`text-xs ${object.visibility === 'invisible' ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-[#252525] border-[#333] text-gray-400'}`}
                                                    onClick={() => onAction('setObjectVisibility', object.id, 'invisible')}
                                                >
                                                    <Ghost size={12} className="mr-1" />
                                                    Inv.
                                                </Button>
                                            </div>

                                            {/* 🆕 Player Selection for Custom Visibility */}
                                            {object.visibility === 'custom' && (
                                                <div className="mt-2 bg-[#1a1a1a] p-2 rounded border border-[#444] space-y-1 max-h-40 overflow-y-auto">
                                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Visible pour:</p>
                                                    {players.length === 0 ? (
                                                        <p className="text-xs text-gray-500 italic">Aucun joueur disponible</p>
                                                    ) : (
                                                        players.map(player => {
                                                            const isSelected = object.visibleToPlayerIds?.includes(player.id) ?? false;
                                                            return (
                                                                <div
                                                                    key={player.id}
                                                                    className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-all duration-150 ${isSelected ? 'bg-purple-900/40 border border-purple-600/50' : 'hover:bg-[#252525] border border-transparent'
                                                                        }`}
                                                                    onClick={() => {
                                                                        const currentIds = object.visibleToPlayerIds || [];
                                                                        const newIds = isSelected
                                                                            ? currentIds.filter(id => id !== player.id)
                                                                            : [...currentIds, player.id];
                                                                        onAction('updateObjectVisiblePlayers', object.id, newIds);
                                                                    }}
                                                                >
                                                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-500 bg-transparent'
                                                                        }`}>
                                                                        {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                                                                    </div>
                                                                    {player.image && (typeof player.image === 'object' ? player.image.src : player.image) ? (
                                                                        <img src={typeof player.image === 'object' ? player.image.src : player.image} className="w-6 h-6 rounded-full object-cover" alt={player.name} />
                                                                    ) : (
                                                                        <div className="w-6 h-6 rounded-full bg-blue-900 flex items-center justify-center text-[10px] text-white font-bold">
                                                                            {player.name[0]}
                                                                        </div>
                                                                    )}
                                                                    <span className="text-xs text-gray-300 flex-1">{player.name}</span>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent value="notes" className="mt-0 pt-2 focus-visible:ring-0">
                                    <EntityNotes
                                        initialNotes={object.notes}
                                        onSave={(notes) => onAction('updateNotes', object.id, notes)}
                                        isReadOnly={!isMJ} // Usually only MJ edits object notes?
                                    />
                                </TabsContent>

                            </div>
                        </ScrollArea>
                    </Tabs>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
