"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Coins } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { VendorInteraction, VendorItem, Character } from '@/app/[roomid]/map/types';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // Assuming Textarea component exists, check generic UI path
import { v4 as uuidv4 } from 'uuid';
import { Pencil, Save, Plus, Trash2, ImageIcon } from 'lucide-react'; // Added icons

interface ShopComponentProps {
    isOpen: boolean;
    onClose: () => void;
    interaction: VendorInteraction;
    vendor: Character;
    onBuyItem?: (item: VendorItem) => void;
    isMJ?: boolean;
    onUpdateInteraction?: (interaction: VendorInteraction) => void;
}

export default function ShopComponent({
    isOpen,
    onClose,
    interaction,
    vendor,
    onBuyItem,
    isMJ,
    onUpdateInteraction
}: ShopComponentProps) {
    const [isEditMode, setIsEditMode] = useState(false);

    // Handlers for Edit Mode
    const handleUpdateName = (name: string) => {
        onUpdateInteraction?.({ ...interaction, name });
    };

    const handleUpdateDescription = (description: string) => {
        onUpdateInteraction?.({ ...interaction, description });
    };

    const handleAddItem = () => {
        const newItem: VendorItem = {
            id: uuidv4(),
            name: "Nouvel Objet",
            price: "10",
            description: "Description de l'objet",
            image: ""
        };
        onUpdateInteraction?.({
            ...interaction,
            items: [...interaction.items, newItem]
        });
    };

    const handleUpdateItem = (itemId: string, field: keyof VendorItem, value: string) => {
        const updatedItems = interaction.items.map(item =>
            item.id === itemId ? { ...item, [field]: value } : item
        );
        onUpdateInteraction?.({ ...interaction, items: updatedItems });
    };

    const handleDeleteItem = (itemId: string) => {
        const updatedItems = interaction.items.filter(item => item.id !== itemId);
        onUpdateInteraction?.({ ...interaction, items: updatedItems });
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-4xl bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[600px]"
                    >
                        {/* Left Side: Items List */}
                        <div className="flex-1 flex flex-col min-w-0 bg-[#161616]">
                            {/* Header */}
                            <div className="p-6 border-b border-white/5 bg-[#1a1a1a] flex justify-between items-start">
                                <div className="flex items-center gap-3 mb-2 flex-1">
                                    <div className="p-2 bg-amber-900/20 rounded-lg text-amber-500">
                                        <ShoppingBag size={24} />
                                    </div>
                                    <div className="flex-1">
                                        {isEditMode ? (
                                            <Input
                                                value={interaction.name}
                                                onChange={(e) => handleUpdateName(e.target.value)}
                                                className="bg-[#111] border-[#333] text-xl font-bold text-white mb-1"
                                            />
                                        ) : (
                                            <h2 className="text-2xl font-bold text-white font-serif">{interaction.name}</h2>
                                        )}
                                        <p className="text-sm text-gray-400">Bienvenue, voyageur.</p>
                                    </div>
                                </div>
                                {isMJ && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIsEditMode(!isEditMode)}
                                        className={`${isEditMode ? 'text-amber-500 bg-amber-900/20' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        {isEditMode ? <Save size={18} /> : <Pencil size={18} />}
                                    </Button>
                                )}
                            </div>

                            {/* Items Grid */}
                            <ScrollArea className="flex-1 p-6">
                                <div className="grid grid-cols-1 gap-3">
                                    {interaction.items.map((item) => (
                                        <div
                                            key={item.id}
                                            className="group relative flex items-center gap-4 p-3 rounded-xl border border-white/5 bg-[#202020] hover:bg-[#252525] transition-all hover:border-amber-500/30"
                                        >
                                            {/* Item Image */}
                                            <div className="w-16 h-16 rounded-lg bg-[#1a1a1a] border border-white/5 flex items-center justify-center shrink-0 overflow-hidden relative">
                                                {item.image ? (
                                                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <ShoppingBag size={24} className="text-gray-600 group-hover:text-amber-500/50 transition-colors" />
                                                )}
                                                {isEditMode && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white p-0">
                                                            <ImageIcon size={14} />
                                                        </Button>
                                                        {/* Simplified image editing for now, could be a prompt or modal */}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Item Details */}
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex justify-between items-start gap-2">
                                                    {isEditMode ? (
                                                        <Input
                                                            value={item.name}
                                                            onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                                                            className="h-7 bg-[#111] border-[#333] font-bold text-gray-200"
                                                        />
                                                    ) : (
                                                        <h3 className="font-bold text-gray-200 group-hover:text-amber-100 transition-colors">{item.name}</h3>
                                                    )}

                                                    {isEditMode ? (
                                                        <div className="flex items-center gap-1 w-24">
                                                            <Input
                                                                value={item.price}
                                                                onChange={(e) => handleUpdateItem(item.id, 'price', e.target.value)}
                                                                className="h-7 bg-[#111] border-[#333] text-amber-500 font-mono text-right px-1"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-black/40 border-amber-500/20 text-amber-500 font-mono shrink-0">
                                                            {item.price}
                                                            <Coins size={12} className="ml-1 inline-block" />
                                                        </Badge>
                                                    )}
                                                </div>

                                                {isEditMode ? (
                                                    <Input
                                                        value={item.description || ""}
                                                        onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                                                        className="h-7 bg-[#111] border-[#333] text-sm text-gray-400"
                                                        placeholder="Description..."
                                                    />
                                                ) : item.description && (
                                                    <p className="text-sm text-gray-500 line-clamp-2 mt-1 group-hover:text-gray-400 transition-colors">{item.description}</p>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            {isEditMode ? (
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="text-red-500 hover:text-red-400 hover:bg-red-950/30 h-8 w-8"
                                                    onClick={() => handleDeleteItem(item.id)}
                                                >
                                                    <Trash2 size={16} />
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-amber-700 hover:bg-amber-600 text-white"
                                                    onClick={() => onBuyItem?.(item)}
                                                >
                                                    Acheter
                                                </Button>
                                            )}
                                        </div>
                                    ))}

                                    {isEditMode && (
                                        <Button
                                            variant="outline"
                                            className="w-full border-dashed border-[#444] text-gray-500 hover:text-amber-500 hover:border-amber-500/50 h-12"
                                            onClick={handleAddItem}
                                        >
                                            <Plus size={16} className="mr-2" /> Ajouter un article
                                        </Button>
                                    )}

                                    {interaction.items.length === 0 && !isEditMode && (
                                        <div className="text-center py-12 text-gray-500">
                                            <p>Ce vendeur n'a rien à vendre pour le moment.</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>

                        {/* Right Side: Vendor Usage (Desktop only preferably, but using flux row for now) */}
                        <div className="w-[350px] bg-[#111] relative border-l border-[#333] shrink-0 hidden md:block">
                            <div className="absolute inset-0">
                                {/* Vendor Background/Image */}
                                <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-transparent z-10" />
                                {vendor.image && (
                                    <img
                                        src={typeof vendor.image === 'object' ? vendor.image.src : vendor.image}
                                        alt={vendor.name}
                                        className="w-full h-full object-cover opacity-60"
                                    />
                                )}
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 p-8 z-20">
                                <h3 className="text-3xl font-bold text-white font-serif mb-2 text-shadow-lg">{vendor.name}</h3>
                                <Badge variant="secondary" className="bg-amber-900/40 text-amber-200 border border-amber-500/30">Vendeur</Badge>

                                <div className="mt-6 p-4 bg-black/60 backdrop-blur-md rounded-xl border border-white/5">
                                    {isEditMode ? (
                                        <Textarea
                                            value={interaction.description || ""}
                                            onChange={(e) => handleUpdateDescription(e.target.value)}
                                            className="bg-[#111] border-[#333] text-sm text-gray-300 min-h-[100px]"
                                            placeholder="Description du vendeur..."
                                        />
                                    ) : (
                                        <p className="text-sm text-gray-300 italic">"{interaction.description || "Jetez un œil à mes marchandises. Vous ne trouverez pas meilleure qualité ailleurs."}"</p>
                                    )}
                                </div>
                            </div>

                            {/* Close Button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-4 right-4 z-50 text-white/50 hover:text-white hover:bg-black/50 rounded-full"
                                onClick={onClose}
                            >
                                <X size={20} />
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
