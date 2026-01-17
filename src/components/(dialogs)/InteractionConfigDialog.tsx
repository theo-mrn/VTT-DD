"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Store, Dices, Package } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Interaction } from '@/app/[roomid]/map/types';
import { v4 as uuidv4 } from 'uuid';

interface InteractionConfigDialogProps {
    isOpen: boolean;
    onClose: () => void;
    // We don't need currentInteraction anymore for creation, as we always create new
    currentInteraction?: Interaction;
    onSave: (interaction: Interaction) => void;
}

export default function InteractionConfigDialog({
    isOpen,
    onClose,
    onSave
}: InteractionConfigDialogProps) {

    if (!isOpen) return null;

    const handleCreate = (type: 'vendor' | 'loot' | 'game') => {
        let interaction: Interaction;
        const id = uuidv4();

        if (type === 'vendor') {
            interaction = {
                id,
                type: 'vendor',
                name: "Nouveau Magasin",
                description: "Bienvenue !",
                items: []
            };
        } else if (type === 'loot') {
            interaction = {
                id,
                type: 'loot',
                name: "Nouveau Conteneur",
                description: "Un conteneur mystérieux...",
                items: []
            };
        } else {
            interaction = {
                id,
                type: 'game',
                name: "Nouveau Jeu",
                description: "Une petite partie ?",
                gameType: 'dice'
            };
        }

        onSave(interaction);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative"
                    >
                        {/* Close Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 text-gray-500 hover:text-white"
                            onClick={onClose}
                        >
                            <X size={20} />
                        </Button>

                        <div className="p-6 text-center">
                            <h2 className="text-xl font-bold text-white mb-2">Ajouter une Interaction</h2>
                            <p className="text-sm text-gray-400 mb-6">Choisissez le type d'interaction à ajouter. Vous pourrez la configurer ensuite.</p>

                            <div className="grid grid-cols-1 gap-3">
                                <Button
                                    variant="outline"
                                    className="h-16 justify-start px-4 bg-[#252525] border-[#333] hover:bg-amber-900/20 hover:border-amber-500/50 hover:text-amber-500 transition-all group"
                                    onClick={() => handleCreate('vendor')}
                                >
                                    <div className="p-2 bg-[#1a1a1a] rounded-lg mr-4 group-hover:bg-amber-500/20 transition-colors">
                                        <Store className="h-6 w-6 text-gray-400 group-hover:text-amber-500" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-gray-200 group-hover:text-white">Vendeur</div>
                                        <div className="text-xs text-gray-500 group-hover:text-gray-400">Créer une boutique ou une auberge</div>
                                    </div>
                                </Button>

                                <Button
                                    variant="outline"
                                    className="h-16 justify-start px-4 bg-[#252525] border-[#333] hover:bg-emerald-900/20 hover:border-emerald-500/50 hover:text-emerald-500 transition-all group"
                                    onClick={() => handleCreate('loot')}
                                >
                                    <div className="p-2 bg-[#1a1a1a] rounded-lg mr-4 group-hover:bg-emerald-500/20 transition-colors">
                                        <Package className="h-6 w-6 text-gray-400 group-hover:text-emerald-500" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-gray-200 group-hover:text-white">Fouille / Butin</div>
                                        <div className="text-xs text-gray-500 group-hover:text-gray-400">Créer un coffre ou une cache oubliée</div>
                                    </div>
                                </Button>

                                <Button
                                    variant="outline"
                                    className="h-16 justify-start px-4 bg-[#252525] border-[#333] hover:bg-purple-900/20 hover:border-purple-500/50 hover:text-purple-500 transition-all group"
                                    onClick={() => handleCreate('game')}
                                >
                                    <div className="p-2 bg-[#1a1a1a] rounded-lg mr-4 group-hover:bg-purple-500/20 transition-colors">
                                        <Dices className="h-6 w-6 text-gray-400 group-hover:text-purple-500" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-gray-200 group-hover:text-white">Mini-Jeu</div>
                                        <div className="text-xs text-gray-500 group-hover:text-gray-400">Lancer des dés ou jouer aux cartes</div>
                                    </div>
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
