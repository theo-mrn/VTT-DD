"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
    Trash2,
    X,
    Lightbulb,
    Radio,
    Sun,
    Maximize
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LightSource } from '@/app/[roomid]/map/types';

interface LightContextMenuProps {
    light: LightSource | null;
    isOpen: boolean;
    onClose: () => void;
    onAction: (action: string, lightId: string, value?: any) => void;
    isMJ: boolean;
}

export default function LightContextMenu({
    light,
    isOpen,
    onClose,
    onAction,
    isMJ
}: LightContextMenuProps) {
    const dragControls = useDragControls();
    const [radius, setRadius] = useState(10); // Default to meters

    useEffect(() => {
        if (light) {
            setRadius(light.radius);
        }
    }, [light]);

    if (!light) return null;

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
                            <div className="w-10 h-10 rounded-full bg-yellow-900/50 flex items-center justify-center text-yellow-400 border border-yellow-500/30">
                                <Lightbulb size={20} />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <h3 className="font-bold text-gray-200 truncate">Source de Lumière</h3>
                                <p className="text-xs text-gray-500 truncate">Éclairage dynamique</p>
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
                                    {/* Radius Control */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <div className="flex items-center gap-2">
                                                <Maximize size={14} className="text-yellow-400" />
                                                <span>Rayon (mètres)</span>
                                            </div>
                                            <span className="font-mono text-yellow-500">{radius} m</span>
                                        </div>

                                        <div className="space-y-2">
                                            <input
                                                type="range"
                                                min="1"
                                                max="50"
                                                step="1"
                                                value={radius}
                                                onChange={(e) => {
                                                    const r = parseInt(e.target.value);
                                                    setRadius(r);
                                                    onAction('updateRadius', light.id, r);
                                                }}
                                                className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                                            />
                                            <div className="flex justify-between text-[10px] text-gray-600 font-mono">
                                                <span>1m</span>
                                                <span>25m</span>
                                                <span>50m</span>
                                            </div>
                                        </div>
                                    </div>

                                    <Separator className="bg-[#333]" />

                                    <Button
                                        variant="outline"
                                        className="w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-red-900/20 hover:text-red-400 text-gray-300 hover:border-red-900/50 transition-colors"
                                        onClick={() => onAction('delete', light.id)}
                                    >
                                        <Trash2 size={16} />
                                        Supprimer la lumière
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
