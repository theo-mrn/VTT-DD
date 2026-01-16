"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Store, Save, Dices } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VendorInteraction, GameInteraction, VendorItem, Interaction } from '@/app/[roomid]/map/types';
import { v4 as uuidv4 } from 'uuid';

interface InteractionConfigDialogProps {
    isOpen: boolean;
    onClose: () => void;
    currentInteraction?: Interaction;
    onSave: (interaction: Interaction) => void;
}

export default function InteractionConfigDialog({
    isOpen,
    onClose,
    currentInteraction,
    onSave
}: InteractionConfigDialogProps) {
    // Type d'interaction sélectionné
    const [interactionType, setInteractionType] = useState<'vendor' | 'game'>(
        currentInteraction?.type || 'vendor'
    );

    // États communs
    const [name, setName] = useState(currentInteraction?.name || "");
    const [description, setDescription] = useState(currentInteraction?.description || "");

    // États pour vendor
    const [items, setItems] = useState<VendorItem[]>(
        currentInteraction?.type === 'vendor' ? currentInteraction.items : []
    );
    const [newItemName, setNewItemName] = useState("");
    const [newItemPrice, setNewItemPrice] = useState("");
    const [newItemDesc, setNewItemDesc] = useState("");
    const [newItemImage, setNewItemImage] = useState("");

    // États pour game
    const [gameType, setGameType] = useState<'dice' | 'cards' | 'custom'>(
        currentInteraction?.type === 'game' ? (currentInteraction.gameType || 'dice') : 'dice'
    );

    // Réinitialiser les valeurs par défaut quand le type change
    useEffect(() => {
        if (interactionType === 'vendor' && !name) {
            setName("Nouveau Magasin");
        } else if (interactionType === 'game' && !name) {
            setName("Jeux de Dés");
        }
    }, [interactionType]);

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
        let interaction: Interaction;

        if (interactionType === 'vendor') {
            interaction = {
                id: currentInteraction?.id || uuidv4(),
                type: 'vendor',
                name: name || "Nouveau Magasin",
                description: description,
                items: items
            };
        } else {
            interaction = {
                id: currentInteraction?.id || uuidv4(),
                type: 'game',
                name: name || "Jeux de Dés",
                description: description,
                gameType: gameType
            };
        }

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
                                {interactionType === 'vendor' ? (
                                    <Store className="text-amber-500" size={20} />
                                ) : (
                                    <Dices className="text-purple-500" size={20} />
                                )}
                                <h2 className="text-lg font-bold text-white">
                                    {interactionType === 'vendor' ? 'Configuration du Vendeur' : 'Configuration du Jeu'}
                                </h2>
                            </div>
                            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 hover:bg-white/10 rounded-full">
                                <X size={18} />
                            </Button>
                        </div>

                        {/* Content */}
                        <ScrollArea className="flex-1 p-6">
                            <div className="space-y-6">
                                {/* Type Selection */}
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-gray-500 font-bold">Type d'Interaction</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            type="button"
                                            variant={interactionType === 'vendor' ? 'default' : 'outline'}
                                            className={`h-12 ${interactionType === 'vendor'
                                                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                                    : 'bg-[#252525] border-[#333] text-gray-400 hover:bg-[#333]'
                                                }`}
                                            onClick={() => setInteractionType('vendor')}
                                        >
                                            <Store className="mr-2 h-4 w-4" />
                                            Vendeur / Magasin
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={interactionType === 'game' ? 'default' : 'outline'}
                                            className={`h-12 ${interactionType === 'game'
                                                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                                                    : 'bg-[#252525] border-[#333] text-gray-400 hover:bg-[#333]'
                                                }`}
                                            onClick={() => setInteractionType('game')}
                                        >
                                            <Dices className="mr-2 h-4 w-4" />
                                            Jeu / Minijeu
                                        </Button>
                                    </div>
                                </div>

                                {/* Nom */}
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-gray-500 font-bold">
                                        {interactionType === 'vendor' ? 'Nom du Commerce' : 'Nom du Jeu'}
                                    </Label>
                                    <Input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className={`bg-[#111] border-[#333] ${interactionType === 'vendor' ? 'focus:border-amber-500/50' : 'focus:border-purple-500/50'
                                            }`}
                                        placeholder={interactionType === 'vendor' ? 'Ex: Armurerie de fer' : 'Ex: Jeux de Dés'}
                                    />
                                </div>

                                {/* Description */}
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-gray-500 font-bold">Message d'accueil / Description</Label>
                                    <Input
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className={`bg-[#111] border-[#333] ${interactionType === 'vendor' ? 'focus:border-amber-500/50' : 'focus:border-purple-500/50'
                                            }`}
                                        placeholder="Message de bienvenue..."
                                    />
                                </div>

                                {/* Configuration spécifique au type */}
                                {interactionType === 'vendor' ? (
                                    /* Items Manager */
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

                                            {items.length === 0 && (
                                                <div className="text-center py-8 text-gray-500 text-sm">
                                                    Aucun article ajouté. Commencez par ajouter des articles à vendre.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    /* Game Configuration */
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs uppercase text-gray-500 font-bold">Type de Jeu</Label>
                                            <Select value={gameType} onValueChange={(value: 'dice' | 'cards' | 'custom') => setGameType(value)}>
                                                <SelectTrigger className="bg-[#111] border-[#333] focus:border-purple-500/50">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#1a1a1a] border-[#333]">
                                                    <SelectItem value="dice" className="text-gray-200 focus:bg-purple-900/20 focus:text-white">
                                                        🎲 Jeux de Dés
                                                    </SelectItem>
                                                    <SelectItem value="cards" className="text-gray-200 focus:bg-purple-900/20 focus:text-white">
                                                        🃏 Jeux de Cartes
                                                    </SelectItem>
                                                    <SelectItem value="custom" className="text-gray-200 focus:bg-purple-900/20 focus:text-white">
                                                        🎮 Personnalisé
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="bg-purple-950/20 p-4 rounded-lg border border-purple-500/20">
                                            <p className="text-xs text-gray-400">
                                                Le jeu de dés est actuellement disponible. Les autres types de jeux seront ajoutés dans les prochaines mises à jour.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        {/* Footer */}
                        <div className="p-4 bg-[#202020] border-t border-white/5 flex justify-end gap-2">
                            <Button variant="ghost" onClick={onClose} className="h-9">Annuler</Button>
                            <Button
                                onClick={handleSave}
                                className={`h-9 gap-2 text-white ${interactionType === 'vendor'
                                        ? 'bg-amber-600 hover:bg-amber-500'
                                        : 'bg-purple-600 hover:bg-purple-500'
                                    }`}
                            >
                                <Save size={16} /> Enregistrer
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
