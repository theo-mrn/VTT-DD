"use client";

import React from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { Trash2, X, Sword, Target } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SharedMeasurement } from '@/app/[roomid]/map/measurements';

interface MeasurementContextMenuProps {
    measurement: SharedMeasurement | null;
    isOpen: boolean;
    onClose: () => void;
    onAction: (action: string, measurementId: string) => void;
}

export default function MeasurementContextMenu({
    measurement,
    isOpen,
    onClose,
    onAction,
}: MeasurementContextMenuProps) {
    const dragControls = useDragControls();

    if (!measurement) return null;

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
                    {/* Header */}
                    <div
                        className="relative h-12 bg-black/40 flex items-center justify-between px-4 cursor-move"
                        onPointerDown={(e) => dragControls.start(e)}
                    >
                        <div className="flex items-center gap-2">
                            <Target size={16} className="text-[#c0a080]" />
                            <span className="font-bold text-[#e0e0e0] text-sm">Zone de Mesure</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-gray-400 hover:text-white"
                            onClick={onClose}
                        >
                            <X size={14} />
                        </Button>
                    </div>

                    <Separator className="bg-[#333]" />

                    <div className="p-4 space-y-2">
                        <Button
                            variant="outline"
                            className="w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#ae3838] hover:text-white text-gray-300"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAction('attack', measurement.id);
                            }}
                        >
                            <Sword size={16} />
                            Attaquer la zone
                        </Button>

                        <Button
                            variant="outline"
                            className="w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-red-500 text-gray-300"
                            onClick={(e) => {
                                e.stopPropagation();
                                onAction('delete', measurement.id);
                            }}
                        >
                            <Trash2 size={16} />
                            Supprimer
                        </Button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
