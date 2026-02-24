import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ScrollArea } from "@/components/ui/scroll-area";
import { DICE_SKINS, DiceSkin } from './dice-definitions';
import { DiceCard } from './dice-card';
import { Store, Backpack, Gem, X, Loader2, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { auth, db, doc, getDoc, updateDoc } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion } from 'firebase/firestore';
import { cn } from '@/lib/utils';

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
    const [inventory, setInventory] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState("inventory");
    const [mounted, setMounted] = useState(false);
    const [isLoadingInventory, setIsLoadingInventory] = useState(true);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [uid, setUid] = useState<string | null>(null);
    const [isPremium, setIsPremium] = useState<boolean>(false);

    // Manual portal lifecycle — NO AnimatePresence.
    // shouldRender: controls whether the portal exists in the DOM at all.
    // isVisible: controls CSS opacity/transform transition.
    // pointerEvents is set to 'none' IMMEDIATELY when closing.
    const [shouldRender, setShouldRender] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            const raf = requestAnimationFrame(() => setIsVisible(true));
            return () => cancelAnimationFrame(raf);
        } else {
            setIsVisible(false);
            const timer = setTimeout(() => setShouldRender(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
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
                    let premiumStatus = data.premium;
                    if (premiumStatus === undefined) {
                        try { await updateDoc(userRef, { premium: false }); premiumStatus = false; }
                        catch (e) { console.error("Error setting default premium:", e); }
                    }
                    setIsPremium(!!premiumStatus);
                    if (!data.dice_inventory) await updateDoc(userRef, { dice_inventory: DEFAULT_INVENTORY });
                } else {
                    setInventory(DEFAULT_INVENTORY);
                }
            } catch (error) {
                console.error('Error loading dice inventory:', error);
                setInventory(DEFAULT_INVENTORY);
            } finally {
                setIsLoadingInventory(false);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        if (isOpen && !activeTab) setActiveTab("inventory");
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose, activeTab]);

    const handleGive = async (skinIdOrName: string) => {
        const id = skinIdOrName.toLowerCase().replace(/^give_/, '');
        const skin = DICE_SKINS[id] || Object.values(DICE_SKINS).find(s => s.name.toLowerCase() === id || s.id === id);
        if (!skin) { toast.error(`Dé inconnu : "${id}".`); return; }
        if (inventory.includes(skin.id)) { toast(`Vous possédez déjà le dé ${skin.name} !`); return; }
        const newInventory = [...inventory, skin.id];
        setInventory(newInventory);
        if (uid) {
            try { await updateDoc(doc(db, 'users', uid), { dice_inventory: arrayUnion(skin.id) }); }
            catch (error) { console.error('[DEV] Error saving given dice:', error); }
        }
        toast.success(`Dé "${skin.name}" ajouté à l'inventaire !`);
    };

    useEffect(() => {
        (window as any).give = (nameOrId: string) => handleGive(nameOrId);
        Object.keys(DICE_SKINS).forEach(id => { (window as any)[`give_${id}`] = () => handleGive(id); });
        return () => {
            delete (window as any).give;
            Object.keys(DICE_SKINS).forEach(id => delete (window as any)[`give_${id}`]);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid, inventory]);

    const handleBuy = async (skin: DiceSkin) => {
        if (skin.price <= 0) {
            setInventory(prev => [...prev, skin.id]);
            if (uid) {
                try { await updateDoc(doc(db, 'users', uid), { dice_inventory: arrayUnion(skin.id) }); }
                catch (error) { console.error('Error saving inventory:', error); }
            }
            toast.success(`Dés ${skin.name} obtenus !`);
            return;
        }
        try {
            setIsCheckingOut(true);
            toast.loading("Redirection vers le paiement...");
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skinId: skin.id, returnUrl: window.location.pathname }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Erreur de paiement');
            toast.dismiss();
            if (data.url) window.location.href = data.url;
            else throw new Error('Url de redirection manquante');
        } catch (error: any) {
            toast.dismiss();
            toast.error(error.message || "Une erreur est survenue lors de l'achat");
        } finally {
            setIsCheckingOut(false);
        }
    };

    const handleEquip = async (skinId: string) => {
        onSelectSkin(skinId);
        if (uid) {
            try { await updateDoc(doc(db, 'users', uid), { dice_skin: skinId }); }
            catch (error) { console.error('Error saving skin:', error); }
        }
        toast.success("Dés équipés");
    };

    const allSkins = Object.values(DICE_SKINS);
    const ownedSkins = allSkins.filter(s => isPremium || inventory.includes(s.id));
    const unownedSkins = allSkins.filter(s => !isPremium && !inventory.includes(s.id));

    if (!mounted || !shouldRender) return null;

    return createPortal(
        <div
            data-dice-store-portal
            className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4"
            style={{
                pointerEvents: isVisible ? 'auto' : 'none',
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 0.25s ease',
            }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div
                className="relative z-10 w-full max-w-4xl h-full max-h-[80vh] flex flex-col overflow-hidden rounded-xl shadow-2xl"
                style={{
                    background: 'var(--bg-dark)',
                    border: '1px solid var(--border-color)',
                    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.97) translateY(12px)',
                    transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Accent line top */}
                <div className="absolute inset-x-0 top-0 h-px z-20 pointer-events-none"
                    style={{ background: 'linear-gradient(90deg, transparent 0%, var(--accent-brown) 50%, transparent 100%)', opacity: 0.5 }} />

                {/* Header */}
                <div className="relative px-5 py-3.5 shrink-0 flex items-center justify-between"
                    style={{ background: 'var(--bg-darker)', borderBottom: '1px solid var(--border-color)' }}>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                            <Store className="w-4 h-4" style={{ color: 'var(--accent-brown)' }} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold tracking-wide" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title, serif)' }}>
                                Magasin de Dés
                            </h2>
                            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Choisissez votre apparence</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150"
                        style={{ color: 'var(--text-secondary)', border: '1px solid transparent' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex items-end gap-0 px-5 shrink-0"
                    style={{ background: 'var(--bg-darker)', borderBottom: '1px solid var(--border-color)' }}>
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className="relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all duration-200"
                                style={{
                                    color: isActive ? 'var(--accent-brown)' : 'var(--text-secondary)',
                                    borderBottom: isActive ? '2px solid var(--accent-brown)' : '2px solid transparent',
                                    marginBottom: '-1px',
                                }}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {tab.label}
                                {tab.id === 'inventory' && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                        style={{
                                            background: isActive ? 'color-mix(in srgb, var(--accent-brown) 20%, transparent)' : 'var(--bg-card)',
                                            color: isActive ? 'var(--accent-brown)' : 'var(--text-secondary)',
                                            border: '1px solid var(--border-color)',
                                        }}>
                                        {ownedSkins.length}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative" style={{ background: 'var(--bg-dark)' }}>
                    {isLoadingInventory ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-brown)' }} />
                            <span className="text-xs animate-pulse" style={{ color: 'var(--text-secondary)' }}>Chargement...</span>
                        </div>
                    ) : (
                        <ScrollArea className="h-full w-full">
                            <div className="p-5 sm:p-6 min-h-full">

                                {activeTab === 'inventory' && (
                                    <div className="flex flex-col pb-20">
                                        {isPremium && (
                                            <div className="mb-5 flex items-center gap-2.5 rounded-lg border p-3"
                                                style={{
                                                    borderColor: 'color-mix(in srgb, var(--accent-brown) 50%, transparent)',
                                                    background: 'color-mix(in srgb, var(--accent-brown) 8%, transparent)',
                                                }}>
                                                <Crown className="h-4 w-4 shrink-0" style={{ color: 'var(--accent-brown)' }} />
                                                <span className="text-xs font-medium" style={{ color: 'var(--accent-brown)' }}>
                                                    Compte Premium — toutes les apparences débloquées.
                                                </span>
                                            </div>
                                        )}
                                        {ownedSkins.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center gap-3 py-20">
                                                <Backpack className="w-10 h-10 opacity-20" style={{ color: 'var(--text-secondary)' }} />
                                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Votre inventaire est vide.</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
                                        )}
                                    </div>
                                )}

                                {activeTab === 'store' && (
                                    <div className="flex flex-col pb-20">
                                        {isPremium ? (
                                            <div className="flex flex-col items-center justify-center gap-4 py-20">
                                                <Crown className="w-12 h-12" style={{ color: 'var(--accent-brown)' }} />
                                                <p className="text-sm font-medium" style={{ color: 'var(--accent-brown)' }}>
                                                    Tous les dés sont dans votre inventaire Premium.
                                                </p>
                                            </div>
                                        ) : unownedSkins.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center gap-4 py-20">
                                                <Gem className="w-12 h-12 opacity-30" style={{ color: 'var(--text-secondary)' }} />
                                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Vous possédez déjà tous les dés !</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
                                    </div>
                                )}

                            </div>
                        </ScrollArea>
                    )}
                </div>
            </div>
        </div>
        , document.body);
}
