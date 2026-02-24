import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DICE_SKINS, DiceSkin } from './dice-definitions';
import { DiceCard } from './dice-card';
import { Store, Backpack, Gem, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, doc, getDoc, updateDoc } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion } from 'firebase/firestore';

// Default skins given to every user
const DEFAULT_INVENTORY = ['gold', 'silver', 'steampunk_copper'];

interface DiceStoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentSkinId: string;
    onSelectSkin: (skinId: string) => void;
}

export function DiceStoreModal({ isOpen, onClose, currentSkinId, onSelectSkin }: DiceStoreModalProps) {
    const [inventory, setInventory] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState("inventory");
    const [mounted, setMounted] = useState(false);
    const [isLoadingInventory, setIsLoadingInventory] = useState(true);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [uid, setUid] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Listen for Firebase auth and load inventory from Firestore
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                // Not logged in: show default skins only
                setInventory(DEFAULT_INVENTORY);
                setIsLoadingInventory(false);
                return;
            }
            setUid(user.uid);
            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    const savedInventory: string[] = data.dice_inventory || DEFAULT_INVENTORY;
                    setInventory(savedInventory);

                    // If user has no dice_inventory yet, initialize it in Firestore
                    if (!data.dice_inventory) {
                        await updateDoc(userRef, { dice_inventory: DEFAULT_INVENTORY });
                    }
                } else {
                    setInventory(DEFAULT_INVENTORY);
                }
            } catch (error) {
                console.error('Error loading dice inventory from Firestore:', error);
                setInventory(DEFAULT_INVENTORY);
            } finally {
                setIsLoadingInventory(false);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    const handleBuy = async (skin: DiceSkin) => {
        if (skin.price <= 0) {
            // Free skin
            const newInventory = [...inventory, skin.id];
            setInventory(newInventory);
            if (uid) {
                try {
                    const userRef = doc(db, 'users', uid);
                    await updateDoc(userRef, { dice_inventory: arrayUnion(skin.id) });
                } catch (error) {
                    console.error('Error saving inventory to Firestore:', error);
                }
            }
            toast.success(`Dés ${skin.name} obtenus !`, {
                icon: <Gem className="w-4 h-4 text-[var(--accent-gold)]" />
            });
            return;
        }

        try {
            setIsCheckingOut(true);
            toast.loading("Redirection vers le paiement...");

            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skinId: skin.id,
                    returnUrl: window.location.pathname
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur de paiement');
            }

            toast.dismiss();

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error('Url de redirection manquante');
            }
        } catch (error: any) {
            console.error("Erreur d'achat:", error);
            toast.dismiss();
            toast.error(error.message || "Une erreur est survenue lors de l'achat");
        } finally {
            setIsCheckingOut(false);
        }
    };

    const handleEquip = async (skinId: string) => {
        onSelectSkin(skinId);
        // Also persist the selected skin to Firestore
        if (uid) {
            try {
                const userRef = doc(db, 'users', uid);
                await updateDoc(userRef, { dice_skin: skinId });
            } catch (error) {
                console.error('Error saving selected skin to Firestore:', error);
            }
        }
        toast.success("Dés équipés");
    };

    // Filter skins
    const allSkins = Object.values(DICE_SKINS);
    const ownedSkins = allSkins.filter(s => inventory.includes(s.id));
    const unownedSkins = allSkins.filter(s => !inventory.includes(s.id));

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center">
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
                                {isLoadingInventory ? (
                                    <div className="flex items-center justify-center h-full gap-3 text-gray-500">
                                        <Loader2 className="w-6 h-6 animate-spin" />
                                        <span>Chargement de l'inventaire...</span>
                                    </div>
                                ) : (
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
                                                        .sort((a, b) => a.price - b.price)
                                                        .map((skin) => (
                                                            <DiceCard
                                                                key={skin.id}
                                                                skin={skin}
                                                                isOwned={false}
                                                                isEquipped={false}
                                                                canAfford={!isCheckingOut}
                                                                onBuy={() => handleBuy(skin)}
                                                                onEquip={() => { }}
                                                            />
                                                        ))}
                                                </div>
                                            )}
                                        </TabsContent>
                                    </ScrollArea>
                                )}
                            </div>
                        </Tabs>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        , document.body);
}
