"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
    Trash2,
    X,
    Music,
    Volume2,
    Radio,
    Disc
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { MusicZone } from '@/app/[roomid]/map/types';

interface MusicZoneContextMenuProps {
    zone: MusicZone | null;
    isOpen: boolean;
    onClose: () => void;
    onAction: (action: string, zoneId: string, value?: any) => void;
    isMJ: boolean;
}

export default function MusicZoneContextMenu({
    zone,
    isOpen,
    onClose,
    onAction,
    isMJ
}: MusicZoneContextMenuProps) {
    const dragControls = useDragControls();
    const [name, setName] = useState("");
    const [volume, setVolume] = useState(0.5);
    const [radius, setRadius] = useState(100);

    useEffect(() => {
        if (zone) {
            setName(zone.name);
            setVolume(zone.volume);
            setRadius(zone.radius);
        }
    }, [zone]);

    if (!zone) return null;

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
                    className="fixed right-24 top-24 w-80 bg-[#1e1e1e]/95 backdrop-blur-md border border-[#333] rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
                >
                    {/* Header avec Icone */}
                    <div
                        className="relative cursor-move p-4 bg-[#252525] border-b border-[#333]"
                        onPointerDown={(e) => dragControls.start(e)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-900/50 flex items-center justify-center text-purple-400 border border-purple-500/30">
                                <Music size={20} />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <h3 className="font-bold text-gray-200 truncate">{zone.name}</h3>
                                <p className="text-xs text-gray-500 truncate">Zone musicale</p>
                            </div>
                        </div>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-6 w-6 text-gray-400 hover:text-white"
                            onClick={onClose}
                        >
                            <X size={14} />
                        </Button>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-4">

                            {/* Actions */}
                            {isMJ && (
                                <>
                                    {/* Name Edit */}
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500 font-medium ml-1">Nom</label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={name}
                                                onChange={(e) => {
                                                    setName(e.target.value);
                                                }}
                                                onBlur={() => {
                                                    if (name !== zone.name) {
                                                        onAction('rename', zone.id, name);
                                                    }
                                                }}
                                                className="h-8 bg-[#252525] border-[#333] text-sm focus:border-purple-500/50"
                                            />
                                        </div>
                                    </div>

                                    <Separator className="bg-[#333]" />

                                    {/* Volume Control */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <div className="flex items-center gap-2">
                                                <Volume2 size={14} className="text-purple-400" />
                                                <span>Volume</span>
                                            </div>
                                            <span>{Math.round(volume * 100)}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={volume}
                                            onChange={(e) => {
                                                const v = parseFloat(e.target.value);
                                                setVolume(v);
                                                onAction('updateVolume', zone.id, v);
                                            }}
                                            className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                    </div>

                                    {/* Radius Control */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <div className="flex items-center gap-2">
                                                <Radio size={14} className="text-blue-400" />
                                                <span>Rayon</span>
                                            </div>
                                            <span>{Math.round(radius / 50)} cases</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="20"
                                            max="1000"
                                            step="10"
                                            value={radius}
                                            onChange={(e) => {
                                                const r = parseInt(e.target.value);
                                                setRadius(r);
                                                onAction('updateRadius', zone.id, r);
                                            }}
                                            className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>

                                    <Separator className="bg-[#333]" />

                                    <Button
                                        variant="outline"
                                        className="w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-red-900/20 hover:text-red-400 text-gray-300 hover:border-red-900/50 transition-colors"
                                        onClick={() => onAction('delete', zone.id)}
                                    >
                                        <Trash2 size={16} />
                                        Supprimer la zone
                                    </Button>
                                </>
                            )}
                        </div>
                    </ScrollArea>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
