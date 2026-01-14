"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Store, Save } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { VendorInteraction, VendorItem } from '@/app/[roomid]/map/types';
import { v4 as uuidv4 } from 'uuid';

interface InteractionConfigDialogProps {
    isOpen: boolean;
    onClose: () => void;
    currentInteraction?: VendorInteraction;
    onSave: (interaction: VendorInteraction) => void;
}

export default function InteractionConfigDialog({
    isOpen,
    onClose,
    currentInteraction,
    onSave
}: InteractionConfigDialogProps) {
    // Initial state setup
    // For now, we only handle 'vendor' type, so we default to that or existing
    const [name, setName] = useState(currentInteraction?.name || "Nouveau Magasin");
    const [description, setDescription] = useState(currentInteraction?.description || "");
    const [items, setItems] = useState<VendorItem[]>(currentInteraction?.items || []);

    // New Item Form State
    const [newItemName, setNewItemName] = useState("");
    const [newItemPrice, setNewItemPrice] = useState("");
    const [newItemDesc, setNewItemDesc] = useState("");
    const [newItemImage, setNewItemImage] = useState("");

    if (!isOpen) return null;

    const handleAddItem = () => {
        if (!newItemName || !newItemPrice) return;

        const newItem: VendorItem = {
            id: uuidv4(),
            name: newItemName,
            price: newItemPrice,
            description: newItemDesc,
            image: newItemImage
        };

        setItems([...items, newItem]);

        // Reset form
        setNewItemName("");
        setNewItemPrice("");
        setNewItemDesc("");
        setNewItemImage("");
    };

    const handleDeleteItem = (id: string) => {
        setItems(items.filter(i => i.id !== id));
    };

    const handleSave = () => {
        const interaction: VendorInteraction = {
            id: currentInteraction?.id || uuidv4(),
            type: 'vendor',
            name: name,
            description: description,
            items: items
        };
        onSave(interaction);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#202020]">
                            <div className="flex items-center gap-2">
                                <Store className="text-amber-500" size={20} />
                                <h2 className="text-lg font-bold text-white">Configuration du Vendeur</h2>
                            </div>
                            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 hover:bg-white/10 rounded-full">
                                <X size={18} />
                            </Button>
                        </div>

                        {/* Content */}
                        <ScrollArea className="flex-1 p-6">
                            <div className="space-y-6">
                                {/* Vendor Details */}
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-gray-500 font-bold">Nom du Commerce</Label>
                                    <Input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="bg-[#111] border-[#333] focus:border-amber-500/50"
                                        placeholder="Ex: Armurerie de fer"
                                    />
                                </div>

                                {/* Description */}
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-gray-500 font-bold">Message d'accueil / Description</Label>
                                    <Input
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="bg-[#111] border-[#333] focus:border-amber-500/50"
                                        placeholder="Message de bienvenue..."
                                    />
                                </div>

                                {/* Items Manager */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end border-b border-white/5 pb-2">
                                        <Label className="text-xs uppercase text-gray-500 font-bold">Articles ({items.length})</Label>
                                    </div>

                                    {/* Add New Item Form */}
                                    <div className="grid grid-cols-12 gap-2 bg-[#252525]/50 p-3 rounded-lg border border-dashed border-white/10">
                                        <div className="col-span-4">
                                            <Input
                                                placeholder="Nom"
                                                value={newItemName}
                                                onChange={(e) => setNewItemName(e.target.value)}
                                                className="h-8 bg-[#111] border-[#333] text-xs"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <Input
                                                placeholder="Prix"
                                                value={newItemPrice}
                                                onChange={(e) => setNewItemPrice(e.target.value)}
                                                className="h-8 bg-[#111] border-[#333] text-xs"
                                            />
                                        </div>
                                        <div className="col-span-5">
                                            <Input
                                                placeholder="Image URL (opt)"
                                                value={newItemImage}
                                                onChange={(e) => setNewItemImage(e.target.value)}
                                                className="h-8 bg-[#111] border-[#333] text-xs"
                                            />
                                        </div>
                                        <div className="col-span-12">
                                            <Input
                                                placeholder="Description courte..."
                                                value={newItemDesc}
                                                onChange={(e) => setNewItemDesc(e.target.value)}
                                                className="h-8 bg-[#111] border-[#333] text-xs"
                                            />
                                        </div>
                                        <div className="col-span-12 pt-1">
                                            <Button
                                                size="sm"
                                                className="w-full h-7 text-xs bg-[#333] hover:bg-amber-600 text-gray-300 hover:text-white"
                                                onClick={handleAddItem}
                                                disabled={!newItemName || !newItemPrice}
                                            >
                                                <Plus size={12} className="mr-1" /> Ajouter l'article
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Existing Items List */}
                                    <div className="space-y-2">
                                        {items.map((item) => (
                                            <div key={item.id} className="flex items-center gap-3 p-2 bg-[#202020] rounded border border-white/5 group">
                                                {item.image && (
                                                    <img src={item.image} alt="" className="w-8 h-8 rounded bg-black object-cover" />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between">
                                                        <span className="text-sm font-medium text-gray-200">{item.name}</span>
                                                        <span className="text-xs font-mono text-amber-500">{item.price}</span>
                                                    </div>
                                                    {item.description && (
                                                        <p className="text-xs text-gray-500 truncate">{item.description}</p>
                                                    )}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => handleDeleteItem(item.id)}
                                                >
                                                    <Trash2 size={12} />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </ScrollArea>

                        {/* Footer */}
                        <div className="p-4 bg-[#202020] border-t border-white/5 flex justify-end gap-2">
                            <Button variant="ghost" onClick={onClose} className="h-9">Annuler</Button>
                            <Button onClick={handleSave} className="h-9 bg-amber-600 hover:bg-amber-500 text-white gap-2">
                                <Save size={16} /> Enregistrer
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
