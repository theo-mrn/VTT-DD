"use client";

import React from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
    Trash2,
    X,
    Hexagon,
    Edit,
    MapPin
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Portal } from '@/app/[roomid]/map/types';

interface PortalContextMenuProps {
    portal: Portal | null;
    isOpen: boolean;
    onClose: () => void;
    onAction: (action: string, portalId: string) => void;
    isMJ: boolean;
}

export default function PortalContextMenu({
    portal,
    isOpen,
    onClose,
    onAction,
    isMJ
}: PortalContextMenuProps) {
    const dragControls = useDragControls();

    if (!portal) return null;

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
                    {/* Header */}
                    <div
                        className="relative cursor-move p-4 bg-[#252525] border-b border-[#333]"
                        onPointerDown={(e) => dragControls.start(e)}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center border-2 border-white"
                                style={{ backgroundColor: portal.color || '#3b82f6' }}
                            >
                                <Hexagon size={20} className="text-white" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <h3 className="font-bold text-gray-200 truncate">{portal.name || 'Portail'}</h3>
                                <p className="text-xs text-gray-500 truncate">Zone de transition</p>
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
                            {/* Info */}
                            <div className="space-y-2 text-sm text-gray-400">
                                <div className="flex items-center gap-2">
                                    <MapPin size={14} className="text-blue-400" />
                                    <span>Rayon: {portal.radius || 50} px</span>
                                </div>
                                {portal.visible && (
                                    <div className="text-xs text-green-400">
                                        ✓ Visible aux joueurs
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            {isMJ && (
                                <>
                                    <Separator className="bg-[#333]" />

                                    <Button
                                        variant="outline"
                                        className="w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-blue-900/20 hover:text-blue-400 text-gray-300 hover:border-blue-900/50 transition-colors"
                                        onClick={() => onAction('edit', portal.id)}
                                    >
                                        <Edit size={16} />
                                        Modifier le portail
                                    </Button>

                                    <Button
                                        variant="outline"
                                        className="w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-red-900/20 hover:text-red-400 text-gray-300 hover:border-red-900/50 transition-colors"
                                        onClick={() => onAction('delete', portal.id)}
                                    >
                                        <Trash2 size={16} />
                                        Supprimer le portail
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
