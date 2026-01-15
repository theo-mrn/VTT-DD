import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DICE_SKINS, DiceSkin } from './dice-definitions';
import { DiceCard } from './dice-card';
import { Store, Backpack, Gem, X } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// Mock initial state
const INITIAL_BALANCE = 9999999999;
const INITIAL_INVENTORY = ['gold', 'silver', 'steampunk_copper']; // Some starters

interface DiceStoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentSkinId: string;
    onSelectSkin: (skinId: string) => void;
}

export function DiceStoreModal({ isOpen, onClose, currentSkinId, onSelectSkin }: DiceStoreModalProps) {
    const [balance, setBalance] = useState(INITIAL_BALANCE);
    const [inventory, setInventory] = useState<string[]>(INITIAL_INVENTORY);
    const [activeTab, setActiveTab] = useState("inventory");

    // Load state from localStorage on mount
    useEffect(() => {
        const savedBalance = localStorage.getItem('vtt_gold_balance');
        const savedInventory = localStorage.getItem('vtt_dice_inventory');

        if (savedBalance) setBalance(parseInt(savedBalance));
        else {
            localStorage.setItem('vtt_gold_balance', INITIAL_BALANCE.toString());
        }

        if (savedInventory) setInventory(JSON.parse(savedInventory));
        else {
            localStorage.setItem('vtt_dice_inventory', JSON.stringify(INITIAL_INVENTORY));
        }
    }, []);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    const handleBuy = (skin: DiceSkin) => {
        if (balance < skin.price) {
            toast.error("Pas assez d'or !");
            return;
        }

        const newBalance = balance - skin.price;
        const newInventory = [...inventory, skin.id];

        setBalance(newBalance);
        setInventory(newInventory);

        // Save to storage
        localStorage.setItem('vtt_gold_balance', newBalance.toString());
        localStorage.setItem('vtt_dice_inventory', JSON.stringify(newInventory));

        toast.success(`Dés ${skin.name} achetés !`, {
            icon: <Gem className="w-4 h-4 text-[var(--accent-gold)]" />
        });
    };

    const handleEquip = (skinId: string) => {
        onSelectSkin(skinId);
        toast.success("Dés équipés");
    };

    // Filter skins
    const allSkins = Object.values(DICE_SKINS);
    const ownedSkins = allSkins.filter(s => inventory.includes(s.id));
    const unownedSkins = allSkins.filter(s => !inventory.includes(s.id));

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* Backdrop */}
                    <motion.div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    {/* Modal Content */}
                    <motion.div
                        className="relative z-10 w-full max-w-5xl h-[85vh] bg-[#141517] border border-[#333] rounded-xl shadow-2xl flex flex-col overflow-hidden mx-4"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 pb-4 border-b border-white/5 bg-[#1a1b1e]">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-[var(--accent-gold)]/10 rounded-lg">
                                    <Store className="w-5 h-5 text-[var(--accent-gold)]" />
                                </div>
                                <h2 className="text-xl font-bold text-[var(--text-primary)]">Magasin de Dés</h2>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-yellow-500/20 shadow-inner">
                                    <span className="text-yellow-500 font-bold font-mono text-lg">{balance}</span>
                                    <Gem className="w-4 h-4 text-yellow-500 fill-yellow-500/20" />
                                </div>

                                <button
                                    onClick={onClose}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Tabs & Content */}
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                            <div className="px-6 py-2 bg-[#1a1b1e] border-b border-white/5">
                                <TabsList className="grid w-full grid-cols-2 max-w-md bg-black/20">
                                    <TabsTrigger value="inventory" className="data-[state=active]:bg-[var(--accent-gold)] data-[state=active]:text-black">
                                        <Backpack className="w-4 h-4 mr-2" />
                                        Mes Dés ({inventory.length})
                                    </TabsTrigger>
                                    <TabsTrigger value="store" className="data-[state=active]:bg-[var(--accent-gold)] data-[state=active]:text-black">
                                        <Store className="w-4 h-4 mr-2" />
                                        Boutique
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <div className="flex-1 overflow-hidden bg-[#141517]">
                                <ScrollArea className="h-full">
                                    <TabsContent value="inventory" className="p-6 m-0 h-full">
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20">
                                            {ownedSkins.map((skin) => (
                                                <DiceCard
                                                    key={skin.id}
                                                    skin={skin}
                                                    isOwned={true}
                                                    isEquipped={currentSkinId === skin.id}
                                                    canAfford={true}
                                                    onBuy={() => { }}
                                                    onEquip={() => handleEquip(skin.id)}
                                                />
                                            ))}
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="store" className="p-6 m-0 h-full">
                                        {unownedSkins.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4 py-20">
                                                <Gem className="w-16 h-16 opacity-20" />
                                                <p>Vous possédez déjà tous les dés de la boutique !</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20">
                                                {unownedSkins
                                                    // Sort by price ascending
                                                    .sort((a, b) => a.price - b.price)
                                                    .map((skin) => (
                                                        <DiceCard
                                                            key={skin.id}
                                                            skin={skin}
                                                            isOwned={false}
                                                            isEquipped={false}
                                                            canAfford={balance >= skin.price}
                                                            onBuy={() => handleBuy(skin)}
                                                            onEquip={() => { }}
                                                        />
                                                    ))}
                                            </div>
                                        )}
                                    </TabsContent>
                                </ScrollArea>
                            </div>
                        </Tabs>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
