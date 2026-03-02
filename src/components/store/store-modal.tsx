import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ScrollArea } from "@/components/ui/scroll-area";
import { DICE_SKINS, DiceSkin } from '../(dices)/dice-definitions';
import { DiceCard } from '../(dices)/dice-card';
import { TOKEN_DEFINITIONS, DEFAULT_TOKEN_INVENTORY, TokenSkin } from '../(fiches)/token-definitions';
import { TokenCard } from '../(fiches)/token-card';
import { Store, Backpack, Gem, X, Loader2, Crown, LayoutGrid, Dice5, Package } from 'lucide-react';
import { toast } from 'sonner';
import { auth, db, doc, getDoc, updateDoc } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion } from 'firebase/firestore';

// Default skins given to every user
const DEFAULT_DICE_INVENTORY = ['gold', 'silver', 'steampunk_copper'];

interface StoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialCategory?: 'dice' | 'token';
    // Callbacks for local preview/state updates
    currentDiceSkinId?: string;
    onSelectDiceSkin?: (skinId: string) => void;
    currentTokenSrc?: string;
    onSelectTokenSkin?: (src: string) => void;
    // We need the raw token list from the API for tokens
    tokenList?: { id: number, name: string, src: string }[];
}

const subTabs = [
    { id: 'inventory', label: 'Mon Inventaire', icon: Backpack },
    { id: 'store', label: 'Boutique', icon: Store }
];

export function StoreModal({
    isOpen,
    onClose,
    initialCategory = 'dice',
    currentDiceSkinId,
    onSelectDiceSkin,
    currentTokenSrc,
    onSelectTokenSkin,
    tokenList = []
}: StoreModalProps) {
    const [activeCategory, setActiveCategory] = useState<'dice' | 'token'>(initialCategory);
    const [activeTab, setActiveTab] = useState<'inventory' | 'store'>("inventory");

    // User State
    const [uid, setUid] = useState<string | null>(null);
    const [isPremium, setIsPremium] = useState<boolean>(false);
    const [diceInventory, setDiceInventory] = useState<string[]>([]);
    const [tokenInventory, setTokenInventory] = useState<string[]>([]);

    // UI State
    const [mounted, setMounted] = useState(false);
    const [isLoadingInventory, setIsLoadingInventory] = useState(true);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    // Sync initialCategory prop if it changes
    useEffect(() => {
        if (isOpen) {
            setActiveCategory(initialCategory);
            setActiveTab("inventory");
        }
    }, [isOpen, initialCategory]);

    // Mount logic
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

    // Load User Inventory
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setDiceInventory(DEFAULT_DICE_INVENTORY);
                setTokenInventory(DEFAULT_TOKEN_INVENTORY);
                setIsLoadingInventory(false);
                return;
            }
            setUid(user.uid);
            try {
                const userRef = doc(db, 'users', user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const data = userSnap.data();

                    setDiceInventory(data.dice_inventory || DEFAULT_DICE_INVENTORY);
                    setTokenInventory(data.token_inventory || DEFAULT_TOKEN_INVENTORY);

                    let premiumStatus = data.premium;
                    if (premiumStatus === undefined) {
                        try { await updateDoc(userRef, { premium: false }); premiumStatus = false; }
                        catch (e) { console.error("Error setting default premium:", e); }
                    }
                    setIsPremium(!!premiumStatus);

                    // Auto-fix missing arrays
                    if (!data.dice_inventory) await updateDoc(userRef, { dice_inventory: DEFAULT_DICE_INVENTORY });
                    if (!data.token_inventory) await updateDoc(userRef, { token_inventory: DEFAULT_TOKEN_INVENTORY });

                } else {
                    setDiceInventory(DEFAULT_DICE_INVENTORY);
                    setTokenInventory(DEFAULT_TOKEN_INVENTORY);
                }
            } catch (error) {
                console.error('Error loading inventory:', error);
                setDiceInventory(DEFAULT_DICE_INVENTORY);
                setTokenInventory(DEFAULT_TOKEN_INVENTORY);
            } finally {
                setIsLoadingInventory(false);
            }
        });
        return () => unsubscribe();
    }, []);

    // Dev Commands for testing
    useEffect(() => {
        const handleGiveDice = async (skinIdOrName: string) => {
            const id = skinIdOrName.toLowerCase().replace(/^give_/, '');
            const skin = DICE_SKINS[id] || Object.values(DICE_SKINS).find(s => s.name.toLowerCase() === id || s.id === id);
            if (!skin) { toast.error(`Dé inconnu : "${id}".`); return; }
            if (diceInventory.includes(skin.id)) { toast(`Vous possédez déjà le dé ${skin.name} !`); return; }
            setDiceInventory(prev => [...prev, skin.id]);
            if (uid) {
                try { await updateDoc(doc(db, 'users', uid), { dice_inventory: arrayUnion(skin.id) }); }
                catch (error) { console.error('[DEV] Error saving given dice:', error); }
            }
            toast.success(`Dé "${skin.name}" ajouté à l'inventaire !`);
        };

        (window as any).give = handleGiveDice;
        Object.keys(DICE_SKINS).forEach(id => { (window as any)[`give_${id}`] = () => handleGiveDice(id); });
        return () => {
            delete (window as any).give;
            Object.keys(DICE_SKINS).forEach(id => delete (window as any)[`give_${id}`]);
        };
    }, [uid, diceInventory]);

    // Keyboard controls
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // --- ACTIONS ---

    const handleBuyItem = async (itemId: string, itemType: 'dice' | 'token', price: number, name: string) => {
        if (price <= 0) {
            // Free items (or challenges parsed as free directly for now)
            if (itemType === 'dice') {
                setDiceInventory(prev => [...prev, itemId]);
                if (uid) await updateDoc(doc(db, 'users', uid), { dice_inventory: arrayUnion(itemId) });
            } else {
                setTokenInventory(prev => [...prev, itemId]);
                if (uid) await updateDoc(doc(db, 'users', uid), { token_inventory: arrayUnion(itemId) });
            }
            toast.success(`${itemType === 'dice' ? 'Dés' : 'Cadre'} "${name}" obtenu !`);
            return;
        }

        try {
            setIsCheckingOut(true);
            toast.loading("Redirection vers le paiement...");

            // Format ID for checkout so backend knows what giving. We prefix tokens.
            const checkoutId = itemType === 'token' ? `token_${itemId}` : itemId;

            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skinId: checkoutId, returnUrl: window.location.pathname }),
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

    const handleEquipDice = async (skinId: string) => {
        if (onSelectDiceSkin) onSelectDiceSkin(skinId);
        if (uid) {
            try { await updateDoc(doc(db, 'users', uid), { dice_skin: skinId }); }
            catch (error) { console.error('Error saving skin:', error); }
        }
        toast.success("Dés équipés");
    };

    const handleEquipToken = async (src: string) => {
        if (onSelectTokenSkin) onSelectTokenSkin(src);
        // We don't save token_skin to db here, it's saved on character save inside CharacterImage.
        toast.success("Cadre appliqué en aperçu");
    };


    // --- DATA PREPARATION ---

    // Dice
    const allDiceSkins = Object.values(DICE_SKINS);
    const ownedDice = allDiceSkins.filter(s => isPremium || diceInventory.includes(s.id));
    const unownedDice = allDiceSkins.filter(s => !isPremium && !diceInventory.includes(s.id));

    // Tokens
    const enrichedTokens = tokenList.map(apiToken => {
        const def = TOKEN_DEFINITIONS[apiToken.name] || {
            id: apiToken.name,
            name: `Cadre ${apiToken.name.replace('Token', '')}`,
            price: 100, // Default price for undocumented tokens
            rarity: 'common',
            unlockCondition: 'purchase'
        } as TokenSkin;

        return { ...def, src: apiToken.src };
    });

    const ownedTokens = enrichedTokens.filter(s => isPremium || tokenInventory.includes(s.id) || s.unlockCondition === 'free');
    const unownedTokens = enrichedTokens.filter(s => !isPremium && !tokenInventory.includes(s.id) && s.unlockCondition !== 'free');


    // --- RENDERERS ---

    const renderDiceGrid = (skins: DiceSkin[], isOwned: boolean) => {
        if (skins.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center gap-4 py-24">
                    {isOwned ? (
                        <>
                            <Package className="w-16 h-16 opacity-20 text-neutral-500" />
                            <p className="text-base text-neutral-500">Votre inventaire est vide.</p>
                        </>
                    ) : (
                        <>
                            <Gem className="w-16 h-16 opacity-20 text-neutral-500" />
                            <p className="text-base text-neutral-400">Vous possédez déjà tous les dés disponibles.</p>
                        </>
                    )}
                </div>
            );
        }

        const sortedSkins = isOwned ? skins : [...skins].sort((a, b) => a.price - b.price);

        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {sortedSkins.map((skin) => (
                    <DiceCard
                        key={skin.id}
                        skin={skin}
                        isOwned={isOwned}
                        isEquipped={currentDiceSkinId === skin.id}
                        canAfford={!isCheckingOut}
                        onBuy={() => handleBuyItem(skin.id, 'dice', skin.price, skin.name)}
                        onEquip={() => handleEquipDice(skin.id)}
                    />
                ))}
            </div>
        );
    };

    const renderTokenGrid = (skins: (TokenSkin & { src: string })[], isOwned: boolean) => {
        if (skins.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center gap-4 py-24">
                    {isOwned ? (
                        <>
                            <Package className="w-16 h-16 opacity-20 text-neutral-500" />
                            <p className="text-base text-neutral-500">Votre inventaire est vide.</p>
                        </>
                    ) : (
                        <>
                            <Gem className="w-16 h-16 opacity-20 text-neutral-500" />
                            <p className="text-base text-neutral-400">Vous possédez déjà tous les cadres disponibles.</p>
                        </>
                    )}
                </div>
            );
        }

        const sortedSkins = isOwned ? skins : [...skins].sort((a, b) => a.price - b.price);

        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {sortedSkins.map((skin) => (
                    <TokenCard
                        key={skin.id}
                        skin={skin}
                        src={skin.src}
                        isOwned={isOwned}
                        isEquipped={currentTokenSrc === skin.src}
                        canAfford={!isCheckingOut}
                        onBuy={() => handleBuyItem(skin.id, 'token', skin.price, skin.name)}
                        onEquip={() => handleEquipToken(skin.src)}
                    />
                ))}
            </div>
        );
    };


    if (!mounted || !shouldRender) return null;

    return createPortal(
        <div
            data-store-portal
            className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4"
            style={{
                pointerEvents: isVisible ? 'auto' : 'none',
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 0.25s ease',
            }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

            {/* Modal */}
            <div
                className="relative z-10 w-full max-w-5xl h-[90vh] max-h-[850px] flex flex-col overflow-hidden rounded-2xl shadow-2xl border border-white/10"
                style={{
                    background: '#09090b',
                    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.97) translateY(12px)',
                    transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* --- HEADER --- */}
                <div className="relative px-6 py-4 shrink-0 flex items-center justify-between bg-white/5 border-b border-white/5">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-black/40 border border-white/10 shadow-inner">
                            <Store className="w-5 h-5 text-neutral-300" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold tracking-wide text-white">Boutique & Inventaire</h2>
                            <p className="text-xs text-neutral-400">Personnalisez votre expérience</p>
                        </div>
                    </div>

                    {/* Category Switcher (Center-ish) */}
                    <div className="hidden md:flex bg-black/50 p-1 rounded-xl border border-white/10 backdrop-blur-sm self-center absolute left-1/2 -translate-x-1/2">
                        <button
                            onClick={() => setActiveCategory('dice')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activeCategory === 'dice'
                                    ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/20'
                                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                                }`}
                        >
                            <Dice5 className="w-4 h-4" />
                            Dés 3D
                        </button>
                        <button
                            onClick={() => setActiveCategory('token')}
                            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${activeCategory === 'token'
                                    ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/20'
                                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                                }`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                            Cadres
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors ml-auto md:ml-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Mobile Category Switcher */}
                <div className="flex md:hidden bg-[#0c0c0e] border-b border-white/5 p-2 gap-2">
                    <button
                        onClick={() => setActiveCategory('dice')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeCategory === 'dice' ? 'bg-white/10 text-white' : 'text-neutral-500'
                            }`}
                    >
                        <Dice5 className="w-4 h-4" />
                        Dés
                    </button>
                    <button
                        onClick={() => setActiveCategory('token')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeCategory === 'token' ? 'bg-white/10 text-white' : 'text-neutral-500'
                            }`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        Cadres
                    </button>
                </div>

                {/* --- SUB TABS --- */}
                <div className="flex items-end gap-2 px-6 shrink-0 bg-[#0c0c0e] border-b border-white/5 pt-2">
                    {subTabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as 'inventory' | 'store')}
                                className={`relative flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-all duration-200 rounded-t-lg
                                    ${isActive ? 'bg-[#050505] text-white border-t border-x border-white/10 border-b-0' : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5 border border-transparent'}`}
                                style={{
                                    borderBottomColor: isActive ? '#050505' : 'transparent',
                                    transform: isActive ? 'translateY(1px)' : 'none',
                                    zIndex: isActive ? 10 : 1
                                }}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* --- CONTENT AREA --- */}
                <div className="flex-1 overflow-hidden relative bg-[#050505] z-0">
                    {isLoadingInventory ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
                            <span className="text-sm text-neutral-500 animate-pulse">Chargement de la boutique...</span>
                        </div>
                    ) : (
                        <ScrollArea className="h-full w-full">
                            <div className="p-6 md:p-8 min-h-full">

                                {/* Premium Banner */}
                                {isPremium && (
                                    <div className="mb-8 flex items-center gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 backdrop-blur-sm shadow-xl shadow-amber-900/10">
                                        <div className="p-2 bg-amber-500/20 rounded-full border border-amber-500/30">
                                            <Crown className="h-6 w-6 text-amber-500 shrink-0 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-amber-500 mb-0.5">Compte Premium Actif</h3>
                                            <p className="text-sm text-amber-600/80">
                                                Vous avez accès à l'intégralité du contenu de la boutique.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Inventory View */}
                                {activeTab === 'inventory' && (
                                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
                                        {activeCategory === 'dice'
                                            ? renderDiceGrid(ownedDice, true)
                                            : renderTokenGrid(ownedTokens, true)
                                        }
                                    </div>
                                )}

                                {/* Store View */}
                                {activeTab === 'store' && (
                                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
                                        {isPremium ? (
                                            <div className="flex flex-col items-center justify-center gap-6 py-32 text-center">
                                                <div className="relative">
                                                    <div className="absolute inset-0 bg-amber-500 blur-3xl opacity-20" />
                                                    <Crown className="w-24 h-24 text-amber-500 relative z-10 drop-shadow-[0_0_25px_rgba(245,158,11,0.6)]" />
                                                </div>
                                                <div className="space-y-2">
                                                    <h3 className="text-2xl font-bold text-amber-500">Boutique dévalisée !</h3>
                                                    <p className="text-base font-medium text-amber-500/80 max-w-md mx-auto">
                                                        En tant que membre Premium, tout le contenu actuel et futur vous est instantanément acquis.
                                                        Rendez-vous dans l'inventaire.
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            activeCategory === 'dice'
                                                ? renderDiceGrid(unownedDice, false)
                                                : renderTokenGrid(unownedTokens, false)
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
