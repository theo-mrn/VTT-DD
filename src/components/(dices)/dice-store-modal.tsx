import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ScrollArea } from "@/components/ui/scroll-area";
import { DICE_SKINS, DiceSkin } from './dice-definitions';
import { DiceCard } from './dice-card';
import { Store, Backpack, Gem, X, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, doc, getDoc, updateDoc } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Canvas } from '@react-three/fiber';
import { View, Environment, Preload } from '@react-three/drei';

// Default skins given to every user
const DEFAULT_INVENTORY = ['gold', 'silver', 'steampunk_copper'];

interface DiceStoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentSkinId: string;
    onSelectSkin: (skinId: string) => void;
}

const tabs = [
    { id: 'inventory', label: 'Mes Dés', icon: Backpack },
    { id: 'store', label: 'Boutique', icon: Store }
];

export function DiceStoreModal({ isOpen, onClose, currentSkinId, onSelectSkin }: DiceStoreModalProps) {
    const containerRef = useRef<HTMLDivElement>(null);
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
        // Reset tab
        if (isOpen && !activeTab) setActiveTab("inventory");
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose, activeTab]);

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
                icon: <Gem className="w-4 h-4 text-amber-500" />
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
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4">
                    {/* Backdrop */}
                    <motion.div
                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    {/* Modal Content */}
                    <motion.div
                        className="relative z-10 w-full max-w-4xl h-full max-h-[80vh] bg-gradient-to-br from-[#121214] via-[#1a1b1e] to-[#0c0c0e] border border-white/10 rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden ring-1 ring-white/5"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="relative p-4 px-6 border-b border-white/5 bg-white/[0.02] overflow-hidden shrink-0">
                            {/* Glow effect */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-amber-500/10 blur-[100px] pointer-events-none rounded-full" />

                            <div className="relative flex items-center justify-between z-10">
                                <div className="flex items-center gap-3">
                                    <div className="relative flex items-center justify-center p-2.5 bg-gradient-to-br from-amber-400/20 to-amber-600/10 rounded-xl border border-amber-500/30 shadow-[0_0_15px_rgba(251,191,36,0.15)]">
                                        <Sparkles className="absolute w-3 h-3 text-amber-200/50 -top-1 -right-1" />
                                        <Store className="w-5 h-5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white via-white/90 to-white/60 bg-clip-text text-transparent">Magasin de Dés</h2>
                                        <p className="text-xs text-white/40 mt-0.5">Personnalisez votre expérience de jeu avec des dés uniques</p>
                                    </div>
                                </div>

                                <button
                                    onClick={onClose}
                                    className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Animated Tabs Navigation */}
                        <div className="flex justify-center p-3 border-b border-white/5 bg-black/20 shrink-0">
                            <div className="flex p-1 bg-black/40 rounded-xl border border-white/5 shadow-inner">
                                {tabs.map((tab) => {
                                    const isActive = activeTab === tab.id;
                                    const Icon = tab.icon;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={cn(
                                                "relative flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors duration-200",
                                                isActive ? "text-amber-950" : "text-white/50 hover:text-white"
                                            )}
                                        >
                                            {isActive && (
                                                <motion.div
                                                    layoutId="modal-active-tab"
                                                    className="absolute inset-0 bg-gradient-to-r from-amber-400 to-amber-500 rounded-lg shadow-[0_0_15px_rgba(251,191,36,0.25)]"
                                                    initial={false}
                                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                                />
                                            )}
                                            <span className="relative z-10 flex items-center gap-1.5">
                                                <Icon className="w-3.5 h-3.5" />
                                                {tab.label} {tab.id === 'inventory' && <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] bg-black/20", isActive ? "text-amber-950 font-bold" : "text-white/40")}>{inventory.length}</span>}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Main Content Area */}
                        <div ref={containerRef} className="flex-1 overflow-hidden relative">
                            {isLoadingInventory ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/40">
                                    <Loader2 className="w-8 h-8 animate-spin text-amber-500/50" />
                                    <span className="font-medium animate-pulse text-sm">Chargement de l'inventaire...</span>
                                </div>
                            ) : (
                                <ScrollArea className="h-full w-full">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={activeTab}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ duration: 0.2 }}
                                            className="p-4 sm:p-6 min-h-full"
                                        >
                                            {activeTab === 'inventory' && (
                                                ownedSkins.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4 py-20">
                                                        <Backpack className="w-12 h-12 opacity-20" />
                                                        <p className="text-sm">Votre inventaire est vide.</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-20">
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
                                                )
                                            )}

                                            {activeTab === 'store' && (
                                                unownedSkins.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center h-full text-white/30 gap-6 py-20">
                                                        <div className="relative">
                                                            <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full" />
                                                            <Gem className="w-16 h-16 text-amber-500/50 drop-shadow-lg relative z-10" />
                                                        </div>
                                                        <p className="text-sm font-medium text-amber-100/50">Vous possédez déjà tous les dés de la boutique !</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-20">
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
                                                )
                                            )}
                                        </motion.div>
                                    </AnimatePresence>
                                </ScrollArea>
                            )}

                            {/* Master Canvas for all Views */}
                            <div className="absolute inset-0 z-50 pointer-events-none">
                                <Canvas eventSource={containerRef as any} className="pointer-events-none" gl={{ alpha: true, antialias: true }}>
                                    <View.Port />
                                    <Preload all />
                                </Canvas>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        , document.body);
}
