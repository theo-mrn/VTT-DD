"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, Plus, Sword, Target, Shield, Beaker, ChevronRight, Coins, Apple } from 'lucide-react';

interface AddItemDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onAdd: (item: { name: string, category: string, quantity: number, weight: number }) => void;
}

interface ItemDescription {
    name: string;
    description: string;
}

const predefinedItems: Record<string, string[]> = {
    'armes-contact': ['Épée à une main', 'Épée à deux mains', 'Épée longue', 'Katana', 'Rapière', 'Hache', 'Marteau'],
    'armes-distance': ['Arc léger', 'Arc lourd', 'Arbalète', 'Couteaux de lancer'],
    'armures': ['Armure légère', 'Armure de cuir', 'Armure lourde', 'Côte de maille'],
    'potions': ['Petite potion de vie', 'Grande potion de vie', 'Fortifiant', 'Potion de dégat'],
    'bourse': ["pièce d'OR", "pièce d'argent", "pièce de cuivre"],
    'nourriture': ['Pomme', 'Pain', 'Fromage', 'Champignon', 'Pomme de terre', 'viande', 'Minotaure'],
    'autre': []
};

const categoryIcons: Record<string, React.ReactNode> = {
    'armes-contact': <Sword className="w-4 h-4 text-[#c0a080]" />,
    'armes-distance': <Target className="w-4 h-4 text-[#c0a080]" />,
    'armures': <Shield className="w-4 h-4 text-[#c0a080]" />,
    'potions': <Beaker className="w-4 h-4 text-[#c0a080]" />,
    'bourse': <Coins className="w-4 h-4 text-[#c0a080]" />,
    'nourriture': <Apple className="w-4 h-4 text-[#c0a080]" />,
    'autre': <ChevronRight className="w-4 h-4 text-[#c0a080]" />,
};

export default function AddItemDialog({ isOpen, onOpenChange, onAdd }: AddItemDialogProps) {
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [currentCategory, setCurrentCategory] = useState<string>('all');
    const [newItemName, setNewItemName] = useState<string>('');
    const [customQuantity, setCustomQuantity] = useState<number>(1);
    const [itemDescriptions, setItemDescriptions] = useState<Record<string, ItemDescription>>({});

    useEffect(() => {
        const loadItemDescriptions = async () => {
            try {
                const response = await fetch('/tabs/Items.json');
                const data = await response.json();
                const descriptions: Record<string, ItemDescription> = {};

                for (let i = 1; i <= 21; i++) {
                    const name = data[`Affichage${i}`];
                    const description = data[`rang${i}`];
                    if (name && description) {
                        descriptions[name.toLowerCase()] = { name, description };
                    }
                }
                setItemDescriptions(descriptions);
            } catch (error) {
                console.error('Erreur lors du chargement des descriptions:', error);
            }
        };

        if (isOpen) {
            loadItemDescriptions();
            setCustomQuantity(1); // Reset quantity when dialog opens
        }
    }, [isOpen]);

    const handleAddItem = (name: string, category: string, quantity: number = 1) => {
        onAdd({
            name,
            category,
            quantity,
            weight: 1
        });
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="!max-w-[95vw] !w-[1400px] !max-h-[90vh] !min-h-[600px] overflow-hidden flex flex-col bg-[#1a1a1a] text-white border-[#333]">
                <DialogHeader className="flex-shrink-0 pb-4 border-b border-[#333]">
                    <DialogTitle className="text-xl flex items-center gap-2 text-amber-500">
                        <Plus className="w-5 h-5" />
                        Ajouter un objet
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {/* Search and Filters */}
                    <div className="flex-shrink-0 py-4 space-y-4 border-b border-[#333]">
                        <div className="relative w-full">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                                placeholder="Rechercher un objet..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-16 h-14 text-lg bg-[#222] border-[#333] text-white focus:ring-amber-500/50"
                            />
                        </div>

                        <Select value={currentCategory} onValueChange={setCurrentCategory}>
                            <SelectTrigger className="w-full h-14 text-lg bg-[#222] border-[#333] text-amber-500">
                                <SelectValue placeholder="Toutes catégories" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#222] border-[#333] text-gray-300">
                                <SelectItem value="all">Toutes catégories</SelectItem>
                                {Object.keys(predefinedItems).map((category) => (
                                    <SelectItem key={category} value={category}>
                                        <div className="flex items-center gap-2">
                                            {categoryIcons[category]}
                                            {category}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex gap-8 flex-1 min-h-0 overflow-hidden pt-4">
                        {/* Predefined Items */}
                        <div className="flex-[3] overflow-hidden flex flex-col">
                            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                                <h3 className="font-semibold text-amber-500 flex items-center gap-2 text-lg">
                                    <Search className="w-5 h-5" />
                                    Objets prédéfinis
                                </h3>
                                <div className="flex items-center gap-2">
                                    <Label className="text-gray-400 text-sm">Quantité:</Label>
                                    <Input
                                        type="number"
                                        value={customQuantity}
                                        onChange={(e) => setCustomQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-20 h-9 bg-[#222] border-[#333] text-white text-center"
                                        min={1}
                                    />
                                </div>
                            </div>

                            <div className="overflow-y-auto flex-1 pr-3 custom-scrollbar">
                                <div className="space-y-6">
                                    {Object.entries(predefinedItems)
                                        .filter(([categoryKey]) => currentCategory === 'all' || !currentCategory || currentCategory === categoryKey)
                                        .map(([categoryKey, items]) => {
                                            const filteredItems = items.filter(item => {
                                                const searchLower = searchTerm.toLowerCase();
                                                const itemDescription = itemDescriptions[item.toLowerCase()];
                                                return item.toLowerCase().includes(searchLower) ||
                                                    (itemDescription && itemDescription.description.toLowerCase().includes(searchLower));
                                            });

                                            if (filteredItems.length === 0) return null;

                                            return (
                                                <div key={categoryKey} className="bg-[#222]/50 rounded-xl border border-[#333] p-5">
                                                    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[#333]">
                                                        {categoryIcons[categoryKey]}
                                                        <h4 className="font-semibold text-amber-500 text-lg">{categoryKey}</h4>
                                                        <span className="ml-auto text-sm text-gray-500 bg-[#111] px-2 py-1 rounded">
                                                            {filteredItems.length} objet{filteredItems.length > 1 ? 's' : ''}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                                        {filteredItems.map(item => {
                                                            const itemDescription = itemDescriptions[item.toLowerCase()];
                                                            return (
                                                                <div
                                                                    key={item}
                                                                    className="bg-[#2a2a2a] rounded-lg p-4 hover:bg-[#333] transition-all duration-200 cursor-pointer border border-[#333] group"
                                                                    onClick={() => handleAddItem(item, categoryKey, customQuantity)}
                                                                >
                                                                    <div className="flex items-start flex-col gap-2">
                                                                        <div className="flex items-center justify-between w-full">
                                                                            <h5 className="font-semibold text-gray-200 text-sm group-hover:text-amber-500 transition-colors">{item}</h5>
                                                                            <Plus className="w-4 h-4 text-gray-500 group-hover:text-white flex-shrink-0" />
                                                                        </div>
                                                                        {itemDescription && (
                                                                            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                                                                                {itemDescription.description}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        </div>

                        {/* Separator */}
                        <div className="w-px bg-[#333] flex-shrink-0"></div>

                        {/* Custom Item */}
                        <div className="flex-1 min-w-0 flex flex-col">
                            <h3 className="font-semibold mb-4 text-amber-500 flex items-center gap-2 text-lg flex-shrink-0">
                                <Plus className="w-5 h-5" />
                                Créer un objet personnalisé
                            </h3>

                            <div className="space-y-4 flex-1">
                                <div className="bg-[#222]/50 rounded-xl border border-[#333] p-5">
                                    <div className="space-y-4">
                                        <div>
                                            <Label className="text-gray-400 text-sm font-medium mb-2 block">Nom de l&apos;objet</Label>
                                            <Input
                                                value={newItemName}
                                                onChange={(e) => setNewItemName(e.target.value)}
                                                className="h-10 bg-[#1a1a1a] border-[#333] text-white"
                                                placeholder="Ex: Épée enchantée"
                                            />
                                        </div>

                                        <div>
                                            <Label className="text-gray-400 text-sm font-medium mb-2 block">Catégorie</Label>
                                            <Select value={currentCategory} onValueChange={setCurrentCategory}>
                                                <SelectTrigger className="h-10 bg-[#1a1a1a] border-[#333] text-amber-500">
                                                    <SelectValue placeholder="Choisir une catégorie..." />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#222] border-[#333] text-gray-300">
                                                    {Object.keys(predefinedItems).map((category) => (
                                                        <SelectItem key={category} value={category}>
                                                            <div className="flex items-center gap-2">
                                                                {categoryIcons[category]}
                                                                {category}
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div>
                                            <Label className="text-gray-400 text-sm font-medium mb-2 block">Quantité</Label>
                                            <Input
                                                type="number"
                                                value={customQuantity}
                                                onChange={(e) => setCustomQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="h-10 bg-[#1a1a1a] border-[#333] text-white"
                                                placeholder="1"
                                                min={1}
                                            />
                                        </div>

                                        <Button
                                            onClick={() => {
                                                if (newItemName && currentCategory && currentCategory !== 'all') {
                                                    handleAddItem(newItemName, currentCategory, customQuantity);
                                                    setNewItemName('');
                                                    setCustomQuantity(1);
                                                }
                                            }}
                                            disabled={!newItemName || !currentCategory || currentCategory === 'all'}
                                            className="w-full h-11 font-medium bg-amber-600 hover:bg-amber-700 text-white"
                                        >
                                            <Plus className="w-4 h-4 mr-2" />
                                            Créer l&apos;objet personnalisé
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
