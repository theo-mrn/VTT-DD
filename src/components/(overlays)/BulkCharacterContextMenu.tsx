"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Eye,
    EyeOff,
    Users,
    Shield,
    Trash2,
    X,
    Plus,
    Sparkles
} from 'lucide-react';
import { CONDITIONS } from '@/components/(combat)/MJcombat';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

interface BulkCharacterContextMenuProps {
    isOpen: boolean;
    selectedCount: number;
    onClose: () => void;
    onVisibilityChange: (visibility: 'visible' | 'hidden' | 'ally' | 'custom') => void;
    onConditionToggle: (conditionId: string) => void;
    onDelete: () => void;
}

export const BulkCharacterContextMenu: React.FC<BulkCharacterContextMenuProps> = ({
    isOpen,
    selectedCount,
    onClose,
    onVisibilityChange,
    onDelete,
    onConditionToggle
}) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [customCondition, setCustomCondition] = useState("");

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={containerRef}
                    initial={{ scale: 0.95, opacity: 0, y: -10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: -10 }}
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    className="fixed right-20 top-20 max-h-[85vh] w-[340px] bg-[#1a1a1a]/95 backdrop-blur-xl border border-[#333] rounded-xl shadow-2xl ring-1 ring-white/5 overflow-auto z-50"
                >
                    {/* Header */}
                    <div className="p-4 pb-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-blue-900/20 rounded-md">
                                    <Users size={16} className="text-blue-400" />
                                </div>
                                <h3 className="text-sm font-semibold text-white">Sélection Multiple</h3>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-white/50 hover:text-white hover:bg-white/10 rounded-full"
                                onClick={onClose}
                            >
                                <X size={14} />
                            </Button>
                        </div>
                        <Badge variant="outline" className="bg-blue-900/20 text-blue-300 border-blue-500/30">
                            {selectedCount} personnage{selectedCount > 1 ? 's' : ''} sélectionné{selectedCount > 1 ? 's' : ''}
                        </Badge>
                    </div>

                    <Separator className="bg-white/5" />

                    {/* Visibility Actions */}
                    <div className="p-4 space-y-3">
                        <div>
                            <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
                                Modifier la visibilité
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="justify-start gap-2 bg-[#252525] border-white/5 hover:bg-green-900/20 hover:border-green-500/30 hover:text-green-300 text-gray-300 h-9 text-xs"
                                    onClick={() => onVisibilityChange('visible')}
                                >
                                    <Eye size={14} />
                                    Visible
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="justify-start gap-2 bg-[#252525] border-white/5 hover:bg-gray-700/20 hover:border-gray-500/30 hover:text-gray-300 text-gray-400 h-9 text-xs"
                                    onClick={() => onVisibilityChange('hidden')}
                                >
                                    <EyeOff size={14} />
                                    Hidden
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="justify-start gap-2 bg-[#252525] border-white/5 hover:bg-blue-900/20 hover:border-blue-500/30 hover:text-blue-300 text-gray-300 h-9 text-xs"
                                    onClick={() => onVisibilityChange('ally')}
                                >
                                    <Shield size={14} />
                                    Ally
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="justify-start gap-2 bg-[#252525] border-white/5 hover:bg-purple-900/20 hover:border-purple-500/30 hover:text-purple-300 text-gray-300 h-9 text-xs"
                                    onClick={() => onVisibilityChange('custom')}
                                >
                                    <Users size={14} />
                                    Custom
                                </Button>
                            </div>
                        </div>

                        <Separator className="bg-white/5" />

                        {/* Conditions Section */}
                        <div>
                            <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2">
                                Gérer les effets
                            </h4>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                {CONDITIONS.map((condition) => {
                                    const Icon = condition.icon;
                                    return (
                                        <Button
                                            key={condition.id}
                                            variant="outline"
                                            size="sm"
                                            className="justify-start gap-2 bg-[#252525] border-white/5 hover:bg-blue-900/20 hover:border-blue-500/30 hover:text-blue-300 text-gray-300 h-9 text-xs"
                                            onClick={() => onConditionToggle(condition.id)}
                                        >
                                            <Icon size={14} className={condition.color} />
                                            {condition.label}
                                        </Button>
                                    );
                                })}
                            </div>

                            {/* Custom Condition Input */}
                            <div className="flex gap-2">
                                <Input
                                    value={customCondition}
                                    onChange={(e) => setCustomCondition(e.target.value)}
                                    placeholder="Autre effet..."
                                    className="h-8 text-xs bg-[#252525] border-[#333] focus:border-blue-500/50"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && customCondition.trim()) {
                                            onConditionToggle(customCondition.trim());
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
                                            onConditionToggle(customCondition.trim());
                                            setCustomCondition("");
                                        }
                                    }}
                                >
                                    <Plus size={14} />
                                </Button>
                            </div>
                        </div>

                        <Separator className="bg-white/5" />

                        {/* Delete Action */}
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start gap-2 bg-[#252525] border-white/5 hover:bg-red-900/20 hover:border-red-500/30 hover:text-red-400 text-gray-300 h-9 text-xs"
                            onClick={() => {
                                onDelete();
                                onClose();
                            }}
                        >
                            <Trash2 size={14} />
                            Supprimer la sélection ({selectedCount})
                        </Button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
