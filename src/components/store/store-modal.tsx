import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ScrollArea } from "@/components/ui/scroll-area";
import { DICE_SKINS, DiceSkin } from '../(dices)/dice-definitions';
import { DiceCard } from '../(dices)/dice-card';
import { TOKEN_DEFINITIONS, DEFAULT_TOKEN_INVENTORY, TokenSkin, getTokenDefinition } from '../(fiches)/token-definitions';
import { TokenCard } from '../(fiches)/token-card';
import { Store, Backpack, Gem, X, Loader2, Crown, LayoutGrid, Dice5, Package, Settings, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { auth, db, doc, getDoc, updateDoc } from '@/lib/firebase';
import { arrayUnion } from 'firebase/firestore';
import { useGame } from '@/contexts/GameContext';

// Default skins given to every user
const DEFAULT_DICE_INVENTORY = ['gold', 'silver', 'steampunk_copper'];

interface StoreModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialCategory?: 'dice' | 'token';
    currentDiceSkinId?: string;
    onSelectDiceSkin?: (skinId: string) => void;
    currentTokenSrc?: string;
    onSelectTokenSkin?: (src: string) => void;
    tokenList?: { id: number, name: string, src: string }[];
}

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
    const [activeTab, setActiveTab] = useState<'home' | 'store' | 'inventory' | 'premium'>('home');
    const [filter, setFilter] = useState<'all' | 'dice' | 'token'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // User State
    const { user: gameUser } = useGame();
    const [uid, setUid] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [isPremium, setIsPremium] = useState<boolean>(false);
    const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
    const [diceInventory, setDiceInventory] = useState<string[]>([]);
    const [tokenInventory, setTokenInventory] = useState<string[]>([]);
    const [apiTokens, setApiTokens] = useState<{ id: number, name: string, src: string }[]>([]);

    // UI State
    const [mounted, setMounted] = useState(false);
    const [isLoadingInventory, setIsLoadingInventory] = useState(true);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [isManagingPortal, setIsManagingPortal] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    // Sync filter prop on open
    useEffect(() => {
        if (isOpen) {
            setFilter(initialCategory === 'dice' ? 'dice' : 'token');
        }
    }, [isOpen, initialCategory]);

    // Mount and Animation logic
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

    // Load Inventory & Tokens
    useEffect(() => {
        const loadTokens = async () => {
            try {
                const res = await fetch('/api/assets?category=Token&type=image');
                const data = await res.json();
                if (data.assets) {
                    const tokens = data.assets.map((a: any) => {
                        const m = a.name.match(/Token(\d+)\.png/);
                        return m ? { id: parseInt(m[1]), name: a.name.replace('.png', ''), src: a.path || a.localPath } : null;
                    }).filter(Boolean).sort((a: any, b: any) => a.id - b.id);
                    setApiTokens(tokens);
                }
            } catch (e) { console.error('Error fetching tokens:', e); }
        };
        loadTokens();

        const currentUid = gameUser?.uid;
        if (!currentUid) {
            setDiceInventory(DEFAULT_DICE_INVENTORY);
            setTokenInventory(DEFAULT_TOKEN_INVENTORY);
            setIsLoadingInventory(false);
            return;
        }
        setUid(currentUid);
        setEmail(auth.currentUser?.email || null);
        const loadInventory = async () => {
            try {
                const userRef = doc(db, 'users', currentUid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const data = userSnap.data();

                    setDiceInventory(data.dice_inventory || DEFAULT_DICE_INVENTORY);
                    setTokenInventory(data.token_inventory || DEFAULT_TOKEN_INVENTORY);
                    setStripeCustomerId(data.stripeCustomerId || null);

                    let premiumStatus = data.premium;
                    if (premiumStatus === undefined) {
                        try { await updateDoc(userRef, { premium: false }); premiumStatus = false; }
                        catch (e) { console.error("Error setting default premium:", e); }
                    }
                    setIsPremium(!!premiumStatus);
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
        };
        loadInventory();
    }, [gameUser?.uid]);

    // Dev Commands
    useEffect(() => {
        const handleGive = async (id: string, type: 'dice' | 'token') => {
            if (!uid) return;
            const field = type === 'dice' ? 'dice_inventory' : 'token_inventory';
            const setter = type === 'dice' ? setDiceInventory : setTokenInventory;
            try {
                await updateDoc(doc(db, 'users', uid), { [field]: arrayUnion(id) });
                setter(prev => [...prev, id]);
                toast.success(`Objet ajouté au sac !`);
            } catch (e) { console.error("Give failed", e); }
        };
        (window as any).give_dice = (id: string) => handleGive(id, 'dice');
        (window as any).give_token = (id: string) => handleGive(id, 'token');
        return () => { delete (window as any).give_dice; delete (window as any).give_token; };
    }, [uid]);

    // Keyboard controls
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // --- ACTIONS ---

    const handleBuyItem = async (itemId: string, itemType: 'dice' | 'token', price: number, name: string) => {
        if (price <= 0) {
            const invent = itemType === 'dice' ? setDiceInventory : setTokenInventory;
            const field = itemType === 'dice' ? 'dice_inventory' : 'token_inventory';
            invent(prev => [...prev, itemId]);
            if (uid) await updateDoc(doc(db, 'users', uid), { [field]: arrayUnion(itemId) });
            toast.success(`${itemType === 'dice' ? 'Dés' : 'Cadre'} "${name}" obtenu !`);
            return;
        }

        try {
            setIsCheckingOut(true);
            toast.loading("Redirection vers le paiement...");
            const checkoutId = itemType === 'token' ? `token_${itemId}` : itemId;
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skinId: checkoutId, userId: uid, returnUrl: window.location.pathname }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Erreur de paiement');
            if (data.url) window.location.href = data.url;
        } catch (error: any) {
            toast.dismiss();
            toast.error(error.message || "Une erreur est survenue");
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
        if (uid) {
            try { await updateDoc(doc(db, 'users', uid), { token_skin: src }); }
            catch (error) { console.error('Error saving token skin:', error); }
        }
        toast.success("Cadre appliqué");
    };

    const handleSubscribe = async () => {
        setIsCheckingOut(true);
        try {
            const response = await fetch("/api/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: uid || "",
                    userEmail: email || "",
                    returnUrl: window.location.pathname,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Erreur lors de la création de la session.");
            if (data.url) window.location.href = data.url;
        } catch (err: any) {
            toast.error(err.message || "Une erreur est survenue.");
        } finally {
            setIsCheckingOut(false);
        }
    };

    const handleManagePortal = async () => {
        if (!stripeCustomerId) return;
        setIsManagingPortal(true);
        try {
            const response = await fetch("/api/stripe-portal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    stripeCustomerId: stripeCustomerId,
                    returnUrl: window.location.pathname,
                }),
            });
            const data = await response.json();
            if (data.url) window.location.href = data.url;
        } catch (err) {
            console.error("Portal error:", err);
            toast.error("Erreur d'accès au portail de gestion.");
        } finally {
            setIsManagingPortal(false);
        }
    };

    // --- DATA PREPARATION ---

    const allDiceSkins = Object.values(DICE_SKINS);
    const tokensToUse = (tokenList && tokenList.length > 0) ? tokenList : apiTokens;
    const enrichedTokens = tokensToUse.map(apiToken => {
        const def = getTokenDefinition(apiToken.name);
        return { ...def, src: apiToken.src };
    });

    const getInventoryItems = () => {
        const items: ({ type: 'dice', data: DiceSkin } | { type: 'token', data: TokenSkin & { src: string } })[] = [];
        if (filter === 'all' || filter === 'dice') {
            allDiceSkins.filter(s => isPremium || diceInventory.includes(s.id)).forEach(d => items.push({ type: 'dice', data: d }));
        }
        if (filter === 'all' || filter === 'token') {
            enrichedTokens.filter(s => isPremium || tokenInventory.includes(s.id) || s.unlockCondition === 'free').forEach(t => items.push({ type: 'token', data: t }));
        }
        return items;
    };

    const getStoreItems = () => {
        if (isPremium) return [];
        const items: ({ type: 'dice', data: DiceSkin } | { type: 'token', data: TokenSkin & { src: string } })[] = [];
        if (filter === 'all' || filter === 'dice') {
            allDiceSkins.filter(s => !diceInventory.includes(s.id)).forEach(d => items.push({ type: 'dice', data: d }));
        }
        if (filter === 'all' || filter === 'token') {
            enrichedTokens.filter(s => !tokenInventory.includes(s.id) && s.unlockCondition !== 'free').forEach(t => items.push({ type: 'token', data: t }));
        }
        return items;
    };

    const displayItems = activeTab === 'home' ? [] : (activeTab === 'store' ? getStoreItems() : getInventoryItems());

    // --- PAGINATION LOGIC ---
    const totalPages = Math.ceil(displayItems.length / itemsPerPage);
    const paginatedItems = displayItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
        const scrollArea = document.getElementById('store-modal-scroll-area');
        const viewport = scrollArea?.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
    }, [activeTab, filter]);

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        const scrollArea = document.getElementById('store-modal-scroll-area');
        const viewport = scrollArea?.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (!mounted || !shouldRender) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4"
            style={{ pointerEvents: isVisible ? 'auto' : 'none', opacity: isVisible ? 1 : 0, transition: 'opacity 0.25s ease' }}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div
                className="relative z-10 w-full max-w-6xl h-[92vh] max-h-[900px] flex flex-col overflow-hidden rounded-3xl shadow-2xl border border-[var(--border-color)] bg-[var(--bg-dark)] text-[var(--text-primary)]"
                style={{
                    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.98) translateY(10px)',
                    transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* --- HEADER --- */}
                <div className="px-8 py-6 flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-darker)]/40">
                    <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--text-primary)]/10 to-transparent border border-[var(--border-color)] flex items-center justify-center shadow-inner">
                            <Store className="w-6 h-6 text-[var(--accent-brown)]" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black tracking-tight text-[var(--text-primary)] uppercase italic">La Boutique du MJ</h2>
                            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Épique & Légendaire</p>
                        </div>
                    </div>

                    <div className="flex bg-[var(--bg-darker)]/60 p-1.5 rounded-2xl border border-[var(--border-color)] backdrop-blur-md">
                        <button
                            onClick={() => setActiveTab('home')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-tighter transition-all duration-300 ${activeTab === 'home'
                                ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] shadow-[0_0_20px_rgba(var(--accent-brown-rgb),0.3)] scale-105'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                            Accueil
                        </button>
                        <button
                            onClick={() => setActiveTab('store')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-tighter transition-all duration-300 ${activeTab === 'store'
                                ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] shadow-[0_0_20px_rgba(var(--accent-brown-rgb),0.3)] scale-105'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                        >
                            <Store className="w-4 h-4" />
                            Boutique
                        </button>
                        <button
                            onClick={() => setActiveTab('inventory')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-tighter transition-all duration-300 ${activeTab === 'inventory'
                                ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] shadow-[0_0_20px_rgba(var(--accent-brown-rgb),0.3)] scale-105'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                        >
                            <Backpack className="w-4 h-4" />
                            Mon Sac
                        </button>
                        <button
                            onClick={() => setActiveTab('premium')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-tighter transition-all duration-300 ${activeTab === 'premium'
                                ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] shadow-[0_0_20px_rgba(var(--accent-brown-rgb),0.3)] scale-105'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                        >
                            <Crown className="w-4 h-4" />
                            Premium
                        </button>
                    </div>

                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-[var(--text-primary)]/10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* --- FILTERS (Only for Store and Inventory) --- */}
                {(activeTab === 'store' || activeTab === 'inventory') && (
                    <div className="flex items-center gap-3 px-8 py-4 bg-[var(--bg-darker)]/50 border-b border-[var(--border-color)] overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${filter === 'all'
                                ? 'bg-[var(--text-primary)]/10 text-[var(--text-primary)] border-[var(--border-color)]'
                                : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'}`}
                        >
                            Tout Voir
                        </button>
                        <div className="w-[1px] h-4 bg-[var(--border-color)] mx-2" />
                        <button
                            onClick={() => setFilter('dice')}
                            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${filter === 'dice'
                                ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] border-[var(--accent-blue)]/30'
                                : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'}`}
                        >
                            <Dice5 className="w-4 h-4" />
                            Dés 3D
                        </button>
                        <button
                            onClick={() => setFilter('token')}
                            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${filter === 'token'
                                ? 'bg-[var(--accent-brown)]/20 text-[var(--accent-brown)] border-[var(--accent-brown)]/30'
                                : 'text-[var(--text-secondary)] border-transparent hover:text-[var(--text-primary)]'}`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                            Cadres
                        </button>
                    </div>
                )}

                {/* --- CONTENT --- */}
                <div className="flex-1 overflow-hidden relative bg-[var(--bg-canvas)]">
                    {isLoadingInventory ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                            <div className="relative w-16 h-16">
                                <div className="absolute inset-0 border-4 border-[var(--text-primary)]/5 rounded-full" />
                                <div className="absolute inset-0 border-4 border-t-[var(--accent-brown)] rounded-full animate-spin" />
                            </div>
                            <span className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.3em]">Chargement...</span>
                        </div>
                    ) : (
                        <ScrollArea className="h-full" id="store-modal-scroll-area">
                            <div className="p-8">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {/* Homepage Content */}
                                    {activeTab === 'home' && (
                                        <div className="col-span-full space-y-12">
                                            {/* Hero Banner */}
                                            <div className={cn(
                                                "relative rounded-[2.5rem] overflow-hidden border transition-all duration-700 p-8 sm:p-12",
                                                "bg-gradient-to-br from-[var(--accent-brown)]/30 via-[var(--bg-dark)] to-[var(--bg-darker)] border-[var(--accent-brown)]/40",
                                                "hover:shadow-[0_0_80px_rgba(var(--accent-brown-rgb),0.15)] group/hero"
                                            )}>
                                                <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12 group-hover/hero:rotate-[20deg] group-hover/hero:scale-110 transition-transform duration-1000">
                                                    <Crown className="w-80 h-80 text-[var(--accent-brown)]" />
                                                </div>

                                                <div className="relative z-10 flex flex-col items-start gap-6 max-w-xl">
                                                    <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-[var(--accent-brown)]/20 border border-[var(--accent-brown)]/30">
                                                        <Sparkles className="w-4 h-4 text-[var(--accent-brown)]" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-brown)]">Offre Limitée</span>
                                                    </div>

                                                    <div className="space-y-4">
                                                        <h3 className="text-4xl sm:text-5xl font-black text-[var(--text-primary)] italic uppercase tracking-tighter leading-none">VTT-DD <br /><span className="text-[var(--accent-brown)]">PREMIUM</span></h3>
                                                        <p className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-tight opacity-70">
                                                            L'accès total à tous les trésors passés, présents et futurs. Débloquez la puissance ultime.
                                                        </p>
                                                    </div>

                                                    <button
                                                        onClick={() => setActiveTab('premium')}
                                                        className="px-10 py-4 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-[0_0_30px_rgba(var(--accent-brown-rgb),0.4)]"
                                                    >
                                                        En savoir plus
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Section: Featured Dice */}
                                            <div className="space-y-6">
                                                <div className="flex items-end justify-between px-2">
                                                    <div className="space-y-1">
                                                        <h4 className="text-2xl font-black text-[var(--text-primary)] uppercase italic tracking-tighter">Dés Légendaires</h4>
                                                        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em]">Sélection du moment</p>
                                                    </div>
                                                    <button onClick={() => { setActiveTab('store'); setFilter('dice'); }} className="text-[10px] font-black text-[var(--accent-brown)] uppercase tracking-widest hover:underline px-4 py-2 bg-[var(--text-primary)]/5 rounded-xl border border-[var(--border-color)]">
                                                        Voir tout
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                                    {Object.values(DICE_SKINS)
                                                        .filter(s => s.rarity === 'legendary' || s.rarity === 'epic')
                                                        .slice(0, 4)
                                                        .map(skin => (
                                                            <div key={skin.id} className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                                                                <DiceCard
                                                                    skin={skin}
                                                                    isOwned={diceInventory.includes(skin.id)}
                                                                    isEquipped={currentDiceSkinId === skin.id}
                                                                    canAfford={!isCheckingOut}
                                                                    onBuy={() => handleBuyItem(skin.id, 'dice', skin.price, skin.name)}
                                                                    onEquip={() => handleEquipDice(skin.id)}
                                                                />
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            </div>

                                            {/* Section: Latest Tokens */}
                                            <div className="space-y-6">
                                                <div className="flex items-end justify-between px-2">
                                                    <div className="space-y-1">
                                                        <h4 className="text-2xl font-black text-[var(--text-primary)] uppercase italic tracking-tighter">Nouveaux Cadres</h4>
                                                        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.2em]">Personnalisation ultime</p>
                                                    </div>
                                                    <button onClick={() => { setActiveTab('store'); setFilter('token'); }} className="text-[10px] font-black text-[var(--accent-brown)] uppercase tracking-widest hover:underline px-4 py-2 bg-[var(--text-primary)]/5 rounded-xl border border-[var(--border-color)]">
                                                        Voir tout
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                                    {enrichedTokens
                                                        .filter(t => t.unlockCondition === 'purchase' || t.price > 0)
                                                        .slice(0, 4)
                                                        .map(token => (
                                                            <div key={token.id} className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                                                                <TokenCard
                                                                    skin={token}
                                                                    src={token.src}
                                                                    isOwned={tokenInventory.includes(token.id)}
                                                                    isEquipped={currentTokenSrc === token.src}
                                                                    canAfford={!isCheckingOut}
                                                                    onBuy={() => handleBuyItem(token.id, 'token', token.price, token.name)}
                                                                    onEquip={() => handleEquipToken(token.src)}
                                                                />
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Premium Page */}
                                    {activeTab === 'premium' && (
                                        <div className="col-span-full">
                                            <div className={cn(
                                                "relative flex flex-col items-center justify-center rounded-3xl overflow-hidden border transition-all duration-500 min-h-[500px] p-12 text-center",
                                                "bg-gradient-to-br from-[var(--accent-brown)]/20 via-[var(--bg-dark)] to-[var(--bg-darker)] border-[var(--accent-brown)]/30",
                                                "hover:border-[var(--accent-brown)] hover:shadow-[0_0_50px_rgba(var(--accent-brown-rgb),0.1)]"
                                            )}>
                                                <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12">
                                                    <Crown className="w-64 h-64 text-[var(--accent-brown)]" />
                                                </div>

                                                <div className="relative z-10 flex flex-col items-center gap-6 max-w-2xl">
                                                    <div className="w-20 h-20 rounded-3xl bg-[var(--accent-brown)]/10 flex items-center justify-center border border-[var(--accent-brown)]/20 shadow-inner">
                                                        <Crown className="w-10 h-10 text-[var(--accent-brown)]" />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <h3 className="text-4xl font-black text-[var(--text-primary)] italic uppercase tracking-tighter">Abonnement Premium</h3>
                                                        <p className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-widest opacity-60">L'expérience Ultime du MJ</p>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mt-4 text-left">
                                                        {[
                                                            { icon: <Dice5 />, text: "Débloquez TOUS les dés 3D" },
                                                            { icon: <LayoutGrid />, text: "Images de jetons illimitées" },
                                                            { icon: <Package />, text: "Accès aux futurs contenus" },
                                                            { icon: <Sparkles />, text: "Soutenez le créateur" },
                                                        ].map((benefit, i) => (
                                                            <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-[var(--bg-darker)]/50 border border-[var(--border-color)]">
                                                                <div className="text-[var(--accent-brown)]">{benefit.icon}</div>
                                                                <span className="text-xs font-black uppercase tracking-tight">{benefit.text}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="flex flex-col items-center gap-4 mt-8">
                                                        <div className="flex items-baseline gap-1">
                                                            <span className="text-5xl font-black text-[var(--text-primary)] tracking-tighter">4.99 €</span>
                                                            <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">/ mois</span>
                                                        </div>

                                                        {isPremium ? (
                                                            <button
                                                                onClick={handleManagePortal}
                                                                disabled={isManagingPortal}
                                                                className="px-12 py-4 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-2xl text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-xl shadow-[var(--accent-brown)]/20"
                                                            >
                                                                {isManagingPortal ? <Loader2 className="w-5 h-5 animate-spin" /> : <Settings className="w-5 h-5" />}
                                                                Gérer l'abonnement
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={handleSubscribe}
                                                                disabled={isCheckingOut}
                                                                className="px-12 py-4 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-2xl text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-[0_0_40px_rgba(var(--accent-brown-rgb),0.5)]"
                                                            >
                                                                {isCheckingOut ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                                                Devenir Premium
                                                            </button>
                                                        )}
                                                        <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-tighter opacity-50">Annulation à tout moment via Stripe Portal</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Item Grid */}
                                    {activeTab !== 'premium' && (
                                        paginatedItems.length === 0 ? (
                                            <div className="col-span-full py-40 flex flex-col items-center gap-4 opacity-30">
                                                <Package className="w-16 h-16 text-[var(--text-secondary)]" />
                                                <p className="text-xs font-bold uppercase tracking-widest leading-none">Aucun butin ici...</p>
                                            </div>
                                        ) : (
                                            <>
                                                {paginatedItems.map((item) => (
                                                    <div key={`${item.type}-${item.data.id}`} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                        {item.type === 'dice' ? (
                                                            <DiceCard
                                                                skin={item.data}
                                                                isOwned={activeTab === 'inventory' || diceInventory.includes(item.data.id)}
                                                                isEquipped={currentDiceSkinId === item.data.id}
                                                                canAfford={!isCheckingOut}
                                                                onBuy={() => handleBuyItem(item.data.id, 'dice', item.data.price, item.data.name)}
                                                                onEquip={() => handleEquipDice(item.data.id)}
                                                            />
                                                        ) : (
                                                            <TokenCard
                                                                skin={item.data}
                                                                src={item.data.src}
                                                                isOwned={activeTab === 'inventory' || tokenInventory.includes(item.data.id) || item.data.unlockCondition === 'free'}
                                                                isEquipped={currentTokenSrc === item.data.src}
                                                                canAfford={!isCheckingOut}
                                                                onBuy={() => handleBuyItem(item.data.id, 'token', item.data.price, item.data.name)}
                                                                onEquip={() => handleEquipToken(item.data.src)}
                                                            />
                                                        )}
                                                    </div>
                                                ))}

                                                {/* Pagination Controls */}
                                                {totalPages > 1 && (
                                                    <div className="col-span-full flex items-center justify-center gap-4 py-8 border-t border-[var(--border-color)]/30 mt-8">
                                                        <button
                                                            onClick={() => handlePageChange(currentPage - 1)}
                                                            disabled={currentPage === 1}
                                                            className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-[var(--bg-canvas)] rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors border border-[var(--border-color)]/50"
                                                        >
                                                            Précédent
                                                        </button>

                                                        <div className="flex items-center gap-2">
                                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                                                <button
                                                                    key={page}
                                                                    onClick={() => handlePageChange(page)}
                                                                    className={cn(
                                                                        "w-8 h-8 text-xs font-bold rounded-lg transition-all border",
                                                                        currentPage === page
                                                                            ? "bg-[var(--accent-brown)] text-[var(--bg-dark)] border-[var(--accent-brown)] shadow-[0_0_10px_var(--accent-brown)]"
                                                                            : "bg-[var(--bg-canvas)] text-[var(--text-secondary)] border-[var(--border-color)]/50 hover:bg-white/5"
                                                                    )}
                                                                >
                                                                    {page}
                                                                </button>
                                                            ))}
                                                        </div>

                                                        <button
                                                            onClick={() => handlePageChange(currentPage + 1)}
                                                            disabled={currentPage === totalPages}
                                                            className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-[var(--bg-canvas)] rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors border border-[var(--border-color)]/50"
                                                        >
                                                            Suivant
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        )
                                    )}
                                </div>
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </div>
        </div>
        , document.body);
}
