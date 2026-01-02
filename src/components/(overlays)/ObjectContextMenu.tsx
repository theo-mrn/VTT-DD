"use client";

import React from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import {
    Trash2,
    X,
    Lock,
    Unlock,
    Image as ImageIcon
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapObject } from '@/app/[roomid]/map/types';

interface ObjectContextMenuProps {
    object: MapObject | null;
    isOpen: boolean;
    onClose: () => void;
    onAction: (action: string, objectId: string, value?: any) => void;
    isMJ: boolean;
    isBackgroundEditMode: boolean;
}

export default function ObjectContextMenu({
    object,
    isOpen,
    onClose,
    onAction,
    isMJ,
    isBackgroundEditMode
}: ObjectContextMenuProps) {
    const dragControls = useDragControls();

    if (!object) return null;

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
                        className="relative cursor-move h-32"
                        onPointerDown={(e) => dragControls.start(e)}
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

                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-4">
                            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">Actions Objet</h3>

                            <div className="grid grid-cols-1 gap-2">
                                {isMJ && (
                                    <>
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
                                            <span>{Math.round(object.rotation || 0)}°</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="360"
                                            step="5"
                                            value={object.rotation || 0}
                                            onChange={(e) => onAction('rotate', object.id, parseInt(e.target.value))}
                                            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>
                            )}

                        </div>
                    </ScrollArea>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
