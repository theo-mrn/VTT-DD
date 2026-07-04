import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DICE_SKINS, DiceSkin } from '../(dices)/dice-definitions';
import { DiceCard } from '../(dices)/dice-card';
import { FunDiceThrower, FunDiceHandle } from '../(dices)/throw-fun';
import { DEFAULT_TOKEN_INVENTORY, TokenSkin, getTokenDefinition } from '../(fiches)/token-definitions';
import { TokenCard } from '../(fiches)/token-card';
import { Store, Backpack, X, Loader2, Crown, LayoutGrid, Dice5, Package, Settings, Sparkles, Search, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { auth, db, doc, getDoc, updateDoc } from '@/lib/firebase';
import { arrayUnion } from 'firebase/firestore';
import { useGame } from '@/contexts/GameContext';

// Default skins given to every user
const DEFAULT_DICE_INVENTORY = ['gold', 'silver', 'steampunk_copper'];

type TabId = 'catalog' | 'inventory' | 'premium';
type CategoryFilter = 'all' | 'dice' | 'token';
type RarityFilter = 'all' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

const RARITY_OPTIONS: { id: RarityFilter; label: string; color: string }[] = [
    { id: 'all', label: 'Toutes raretés', color: 'var(--text-primary)' },
    { id: 'legendary', label: 'Légendaire', color: 'var(--accent-brown)' },
    { id: 'epic', label: 'Épique', color: 'var(--accent-blue)' },
    { id: 'rare', label: 'Rare', color: '#3b82f6' },
    { id: 'uncommon', label: 'Peu commun', color: '#22c55e' },
    { id: 'common', label: 'Commun', color: '#9ca3af' },
];
const RARITY_ORDER: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

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
    // --- View state ---
    const [activeTab, setActiveTab] = useState<TabId>('catalog');
    const [filter, setFilter] = useState<CategoryFilter>('all');
    const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 12;

    // --- User state ---
    const { user: gameUser } = useGame();
    const [uid, setUid] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [isPremium, setIsPremium] = useState(false);
    const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
    const [diceInventory, setDiceInventory] = useState<string[]>([]);
    const [tokenInventory, setTokenInventory] = useState<string[]>([]);
    const [apiTokens, setApiTokens] = useState<{ id: number, name: string, src: string }[]>([]);

    // --- UI state ---
    const [mounted, setMounted] = useState(false);
    const [isLoadingInventory, setIsLoadingInventory] = useState(true);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [isManagingPortal, setIsManagingPortal] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [rarityOpen, setRarityOpen] = useState(false);
    const rarityRef = useRef<HTMLDivElement>(null);

    // "Try it" dice thrower
    const funDiceRef = useRef<FunDiceHandle>(null);
    const tryDice = (skinId: string) => funDiceRef.current?.roll(skinId, 'd20');

    // Sync initial category to the filter on open
    useEffect(() => {
        if (isOpen) setFilter(initialCategory === 'token' ? 'token' : 'all');
    }, [isOpen, initialCategory]);

    // Mount + open/close animation
    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            const raf = requestAnimationFrame(() => setIsVisible(true));
            return () => cancelAnimationFrame(raf);
        }
        setIsVisible(false);
        const t = setTimeout(() => setShouldRender(false), 300);
        return () => clearTimeout(t);
    }, [isOpen]);

    useEffect(() => { setMounted(true); }, []);

    // Load inventory + API tokens
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
                        catch (e) { console.error('Error setting default premium:', e); }
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

    // Dev give commands
    useEffect(() => {
        const handleGive = async (id: string, type: 'dice' | 'token') => {
            if (!uid) return;
            const field = type === 'dice' ? 'dice_inventory' : 'token_inventory';
            const setter = type === 'dice' ? setDiceInventory : setTokenInventory;
            try {
                await updateDoc(doc(db, 'users', uid), { [field]: arrayUnion(id) });
                setter(prev => [...prev, id]);
                toast.success('Objet ajouté au sac !');
            } catch (e) { console.error('Give failed', e); }
        };
        (window as any).give_dice = (id: string) => handleGive(id, 'dice');
        (window as any).give_token = (id: string) => handleGive(id, 'token');
        return () => { delete (window as any).give_dice; delete (window as any).give_token; };
    }, [uid]);

    // Esc to close
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // Close rarity dropdown on outside click
    useEffect(() => {
        if (!rarityOpen) return;
        const handler = (e: MouseEvent) => {
            if (rarityRef.current && !rarityRef.current.contains(e.target as Node)) setRarityOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [rarityOpen]);

    // --- Actions ---
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
            toast.loading('Redirection vers le paiement...');
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
            toast.error(error.message || 'Une erreur est survenue');
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
        toast.success('Dés équipés');
    };

    const handleEquipToken = async (src: string) => {
        if (onSelectTokenSkin) onSelectTokenSkin(src);
        if (uid) {
            try { await updateDoc(doc(db, 'users', uid), { token_skin: src }); }
            catch (error) { console.error('Error saving token skin:', error); }
        }
        toast.success('Cadre appliqué');
    };

    const handleSubscribe = async () => {
        setIsCheckingOut(true);
        try {
            const response = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: uid || '', userEmail: email || '', returnUrl: window.location.pathname }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Erreur lors de la création de la session.');
            if (data.url) window.location.href = data.url;
        } catch (err: any) {
            toast.error(err.message || 'Une erreur est survenue.');
        } finally {
            setIsCheckingOut(false);
        }
    };

    const handleManagePortal = async () => {
        if (!stripeCustomerId) return;
        setIsManagingPortal(true);
        try {
            const response = await fetch('/api/stripe-portal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stripeCustomerId, returnUrl: window.location.pathname }),
            });
            const data = await response.json();
            if (data.url) window.location.href = data.url;
        } catch (err) {
            console.error('Portal error:', err);
            toast.error("Erreur d'accès au portail de gestion.");
        } finally {
            setIsManagingPortal(false);
        }
    };

    // --- Data ---
    const allDiceSkins = useMemo(() => Object.values(DICE_SKINS), []);
    const tokensToUse = (tokenList && tokenList.length > 0) ? tokenList : apiTokens;
    const enrichedTokens = useMemo(
        () => tokensToUse.map(t => ({ ...getTokenDefinition(t.name), src: t.src })),
        [tokensToUse]
    );

    // Ownership helpers (premium owns everything).
    const ownsDice = (id: string) => isPremium || diceInventory.includes(id);
    const ownsToken = (id: string, unlock?: string) => isPremium || tokenInventory.includes(id) || unlock === 'free';
    const tokenPremiumOnly = (id: string, unlock?: string) => isPremium && !tokenInventory.includes(id) && unlock !== 'free';

    type StoreItem = { type: 'dice', data: DiceSkin } | { type: 'token', data: TokenSkin & { src: string } };

    // Build the visible item list. `ownedOnly` = the "Mon Sac" tab.
    const buildItems = (ownedOnly: boolean): StoreItem[] => {
        const q = searchQuery.trim().toLowerCase();
        const rarityOk = (r?: string) => rarityFilter === 'all' || (r || 'common') === rarityFilter;
        const items: StoreItem[] = [];

        if (filter === 'all' || filter === 'dice') {
            allDiceSkins.forEach(s => {
                if (ownedOnly && !ownsDice(s.id)) return;
                if (!rarityOk(s.rarity)) return;
                if (q && !s.name.toLowerCase().includes(q)) return;
                items.push({ type: 'dice', data: s });
            });
        }
        if (filter === 'all' || filter === 'token') {
            enrichedTokens.forEach(s => {
                if (ownedOnly && !ownsToken(s.id, s.unlockCondition)) return;
                if (!rarityOk(s.rarity)) return;
                if (q && !s.name.toLowerCase().includes(q)) return;
                items.push({ type: 'token', data: s });
            });
        }
        // Highest rarity first, then owned-but-locked (premium) after purchasable.
        return items.sort((a, b) =>
            (RARITY_ORDER[b.data.rarity || 'common'] ?? 0) - (RARITY_ORDER[a.data.rarity || 'common'] ?? 0));
    };

    const displayItems = activeTab === 'premium' ? [] : buildItems(activeTab === 'inventory');
    const totalPages = Math.ceil(displayItems.length / itemsPerPage);
    const paginatedItems = displayItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
        document.getElementById('store-modal-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
    }, [activeTab, filter, rarityFilter, searchQuery]);

    const handlePageChange = (p: number) => {
        setCurrentPage(p);
        document.getElementById('store-modal-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (!mounted || !shouldRender) return null;

    const activeRarity = RARITY_OPTIONS.find(o => o.id === rarityFilter)!;

    const renderCard = (item: StoreItem) => (
        item.type === 'dice' ? (
            <DiceCard
                skin={item.data}
                isOwned={ownsDice(item.data.id)}
                isEquipped={currentDiceSkinId === item.data.id}
                canAfford={!isCheckingOut}
                onBuy={() => handleBuyItem(item.data.id, 'dice', item.data.price, item.data.name)}
                onEquip={() => handleEquipDice(item.data.id)}
                onTry={() => tryDice(item.data.id)}
            />
        ) : (
            <TokenCard
                skin={item.data}
                src={item.data.src}
                isOwned={ownsToken(item.data.id, item.data.unlockCondition)}
                ownedByPremium={tokenPremiumOnly(item.data.id, item.data.unlockCondition)}
                isEquipped={currentTokenSrc === item.data.src}
                canAfford={!isCheckingOut}
                onBuy={() => handleBuyItem(item.data.id, 'token', item.data.price, item.data.name)}
                onEquip={() => handleEquipToken(item.data.src)}
            />
        )
    );

    return createPortal(
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4"
            style={{ pointerEvents: isVisible ? 'auto' : 'none', opacity: isVisible ? 1 : 0, transition: 'opacity 0.25s ease' }}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div
                className="relative z-10 w-full max-w-6xl h-[92vh] max-h-[900px] flex flex-col overflow-hidden rounded-2xl shadow-2xl border border-[var(--border-color)] bg-[var(--bg-dark)] text-[var(--text-primary)]"
                style={{
                    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.98) translateY(10px)',
                    transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ===== HEADER ===== */}
                <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--border-color)] bg-[var(--bg-card)]/80 backdrop-blur-md">
                    <div className="w-10 h-10 shrink-0 rounded-xl bg-[var(--accent-brown)]/10 border border-[var(--border-color)] flex items-center justify-center">
                        <Store className="w-5 h-5 text-[var(--accent-brown)]" />
                    </div>
                    <div className="min-w-0 mr-auto">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] truncate">Boutique</h2>
                            {isPremium && (
                                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--accent-brown)]/15 border border-[var(--accent-brown)]/30 text-[10px] font-bold text-[var(--accent-brown)]">
                                    <Crown className="w-3 h-3" /> Premium
                                </span>
                            )}
                        </div>
                        <p className="hidden sm:block text-sm text-[var(--text-secondary)]">
                            {isPremium ? 'Accès total débloqué' : 'Personnalisez vos dés et vos cadres'}
                        </p>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-darker)]/60 border border-[var(--border-color)]">
                        {([
                            { id: 'catalog', label: 'Catalogue', Icon: Store },
                            { id: 'inventory', label: 'Mon Sac', Icon: Backpack },
                            { id: 'premium', label: 'Premium', Icon: Crown },
                        ] as const).map(({ id, label, Icon }) => (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id)}
                                className={cn(
                                    'flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors',
                                    activeTab === id
                                        ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] shadow'
                                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                )}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                <span className="hidden sm:inline">{label}</span>
                            </button>
                        ))}
                    </div>

                    <button onClick={onClose} className="w-9 h-9 shrink-0 rounded-lg hover:bg-[var(--text-primary)]/10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* ===== TOOLBAR (search + filters) — hidden on Premium tab ===== */}
                {activeTab !== 'premium' && (
                    <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-3 border-b border-[var(--border-color)] bg-[var(--bg-darker)]/40">
                        {/* Search */}
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-dark)] border border-[var(--border-color)] focus-within:border-[var(--accent-brown)]/50 transition-colors sm:w-64">
                            <Search className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                            <input
                                type="text"
                                placeholder="Chercher..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none min-w-0"
                            />
                        </div>

                        {/* Category segmented control */}
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-dark)] border border-[var(--border-color)]">
                            {([
                                { id: 'all', label: 'Tout', Icon: LayoutGrid },
                                { id: 'dice', label: 'Dés', Icon: Dice5 },
                                { id: 'token', label: 'Cadres', Icon: Package },
                            ] as const).map(({ id, label, Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setFilter(id)}
                                    className={cn(
                                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
                                        filter === id
                                            ? 'bg-[var(--text-primary)]/10 text-[var(--text-primary)]'
                                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* Rarity dropdown */}
                        <div ref={rarityRef} className="relative sm:ml-auto">
                            <button
                                onClick={() => setRarityOpen(o => !o)}
                                className="w-full sm:w-48 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--bg-dark)] border border-[var(--border-color)] hover:border-[var(--text-primary)]/20 transition-colors"
                            >
                                <span className="flex items-center gap-2 min-w-0">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: activeRarity.color }} />
                                    <span className="text-sm font-bold truncate" style={{ color: rarityFilter === 'all' ? 'var(--text-secondary)' : activeRarity.color }}>
                                        {activeRarity.label}
                                    </span>
                                </span>
                                <ChevronDown className={cn('w-4 h-4 text-[var(--text-secondary)] transition-transform shrink-0', rarityOpen && 'rotate-180')} />
                            </button>
                            {rarityOpen && (
                                <div className="absolute z-30 right-0 mt-2 w-full sm:w-48 rounded-xl border border-[var(--border-color)] bg-[var(--bg-dark)] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                                    {RARITY_OPTIONS.map(({ id, label, color }) => (
                                        <button
                                            key={id}
                                            onClick={() => { setRarityFilter(id); setRarityOpen(false); }}
                                            className={cn(
                                                'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-left transition-colors',
                                                rarityFilter === id ? 'bg-[var(--text-primary)]/10' : 'hover:bg-[var(--text-primary)]/5'
                                            )}
                                            style={{ color }}
                                        >
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                            {label}
                                            {rarityFilter === id && <Check className="w-4 h-4 ml-auto" strokeWidth={3} />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ===== CONTENT ===== */}
                <div className="flex-1 overflow-hidden relative bg-[var(--bg-canvas)]">
                    {isLoadingInventory ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                            <Loader2 className="w-8 h-8 text-[var(--accent-brown)] animate-spin" />
                            <span className="text-sm font-medium text-[var(--text-secondary)]">Chargement...</span>
                        </div>
                    ) : (
                        <div className="h-full overflow-y-auto custom-scrollbar" id="store-modal-scroll-area" style={{ touchAction: 'pan-y' }}>
                            <div className="p-4 sm:p-6">
                                {activeTab === 'premium' ? (
                                    <PremiumPanel
                                        isPremium={isPremium}
                                        isCheckingOut={isCheckingOut}
                                        isManagingPortal={isManagingPortal}
                                        onSubscribe={handleSubscribe}
                                        onManage={handleManagePortal}
                                    />
                                ) : (
                                    <>
                                        {/* Hero (Catalogue only, not the bag) */}
                                        {activeTab === 'catalog' && !searchQuery && rarityFilter === 'all' && (
                                            <CatalogHero
                                                isPremium={isPremium}
                                                onCta={() => isPremium ? setActiveTab('inventory') : setActiveTab('premium')}
                                            />
                                        )}

                                        {paginatedItems.length === 0 ? (
                                            <EmptyState tab={activeTab} isPremium={isPremium} />
                                        ) : (
                                            <>
                                                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
                                                    {paginatedItems.map(item => (
                                                        <div key={`${item.type}-${item.data.id}`} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                            {renderCard(item)}
                                                        </div>
                                                    ))}
                                                </div>

                                                {totalPages > 1 && (
                                                    <Pagination current={currentPage} total={totalPages} onChange={handlePageChange} />
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <FunDiceThrower ref={funDiceRef} hideButton overlayZIndex={10010} />
        </div>
        , document.body);
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function CatalogHero({ isPremium, onCta }: { isPremium: boolean; onCta: () => void }) {
    return (
        <div className="relative mb-6 rounded-2xl overflow-hidden border border-[var(--accent-brown)]/30 bg-gradient-to-br from-[var(--accent-brown)]/20 via-[var(--bg-dark)] to-[var(--bg-darker)] p-6 sm:p-8">
            <div className="absolute -top-6 -right-6 opacity-[0.06] rotate-12">
                <Crown className="w-56 h-56 text-[var(--accent-brown)]" />
            </div>
            <div className="relative z-10 flex flex-col items-start gap-4 max-w-lg">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-brown)]/15 border border-[var(--accent-brown)]/30 text-xs font-bold text-[var(--accent-brown)]">
                    <Sparkles className="w-3.5 h-3.5" />
                    {isPremium ? 'Membre Premium' : 'Collection légendaire'}
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] leading-tight">
                    {isPremium ? 'Tous les trésors sont à vous' : 'Équipez des dés & cadres uniques'}
                </h3>
                <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                    {isPremium
                        ? 'Équipez librement tout le catalogue, présent et à venir.'
                        : 'Des dés 3D animés aux cadres de personnage — trouvez la pièce qui vous ressemble, ou débloquez tout avec Premium.'}
                </p>
                <button
                    onClick={onCta}
                    className="mt-1 px-6 py-3 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-xl text-sm font-bold hover:bg-[var(--accent-brown-hover)] active:scale-95 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(192,160,128,0.2)]"
                >
                    {isPremium ? <><Backpack className="w-4 h-4" /> Voir mon sac</> : <><Crown className="w-4 h-4" /> Découvrir Premium</>}
                </button>
            </div>
        </div>
    );
}

function EmptyState({ tab, isPremium }: { tab: TabId; isPremium: boolean }) {
    const message = tab === 'inventory'
        ? "Votre sac est vide. Débloquez des dés et des cadres pour les retrouver ici."
        : isPremium
            ? "Aucun objet ne correspond à ces filtres."
            : "Aucun objet ne correspond à votre recherche.";
    return (
        <div className="py-24 flex flex-col items-center gap-4 text-center opacity-50">
            <Package className="w-14 h-14 text-[var(--text-secondary)]" />
            <p className="text-sm font-medium text-[var(--text-secondary)] max-w-xs">{message}</p>
        </div>
    );
}

function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
    return (
        <div className="flex items-center justify-center gap-2 py-8 mt-6 border-t border-[var(--border-color)]/40">
            <button
                onClick={() => onChange(current - 1)}
                disabled={current === 1}
                className="px-4 py-2 text-sm font-bold rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
            >
                <span className="hidden sm:inline">Précédent</span><span className="sm:hidden">‹</span>
            </button>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[45vw] sm:max-w-none">
                {Array.from({ length: total }, (_, i) => i + 1).map(page => (
                    <button
                        key={page}
                        onClick={() => onChange(page)}
                        className={cn(
                            'w-9 h-9 text-sm font-bold rounded-lg border transition-colors shrink-0',
                            current === page
                                ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] border-[var(--accent-brown)]'
                                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-white/5'
                        )}
                    >
                        {page}
                    </button>
                ))}
            </div>
            <button
                onClick={() => onChange(current + 1)}
                disabled={current === total}
                className="px-4 py-2 text-sm font-bold rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
            >
                <span className="hidden sm:inline">Suivant</span><span className="sm:hidden">›</span>
            </button>
        </div>
    );
}

function PremiumPanel({ isPremium, isCheckingOut, isManagingPortal, onSubscribe, onManage }: {
    isPremium: boolean; isCheckingOut: boolean; isManagingPortal: boolean;
    onSubscribe: () => void; onManage: () => void;
}) {
    const benefits = [
        { Icon: Dice5, text: 'Tous les dés 3D animés débloqués' },
        { Icon: LayoutGrid, text: 'Tous les cadres de personnage' },
        { Icon: Package, text: 'Accès aux futurs contenus' },
        { Icon: Sparkles, text: 'Soutenez le développement' },
    ];
    return (
        <div className="max-w-2xl mx-auto">
            <div className="relative rounded-2xl overflow-hidden border border-[var(--accent-brown)]/30 bg-gradient-to-br from-[var(--accent-brown)]/15 via-[var(--bg-dark)] to-[var(--bg-darker)] p-6 sm:p-10 text-center">
                <div className="absolute -top-8 -right-8 opacity-[0.08] rotate-12">
                    <Crown className="w-64 h-64 text-[var(--accent-brown)]" />
                </div>
                <div className="relative z-10 flex flex-col items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--accent-brown)]/15 border border-[var(--accent-brown)]/25 flex items-center justify-center">
                        <Crown className="w-8 h-8 text-[var(--accent-brown)]" />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tracking-tight">Abonnement Premium</h3>
                        <p className="text-sm text-[var(--text-secondary)]">L'expérience complète, sans limites</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                        {benefits.map(({ Icon, text }, i) => (
                            <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                                <Icon className="w-5 h-5 text-[var(--accent-brown)] shrink-0" />
                                <span className="text-sm font-medium text-[var(--text-primary)]">{text}</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col items-center gap-4 mt-2">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-4xl font-bold text-[var(--text-primary)]">4,99 €</span>
                            <span className="text-sm text-[var(--text-secondary)]">/ mois</span>
                        </div>
                        {isPremium ? (
                            <button
                                onClick={onManage}
                                disabled={isManagingPortal}
                                className="px-8 py-3.5 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-xl text-sm font-bold hover:bg-[var(--accent-brown-hover)] active:scale-95 transition-all flex items-center gap-2"
                            >
                                {isManagingPortal ? <Loader2 className="w-5 h-5 animate-spin" /> : <Settings className="w-5 h-5" />}
                                Gérer l'abonnement
                            </button>
                        ) : (
                            <button
                                onClick={onSubscribe}
                                disabled={isCheckingOut}
                                className="px-8 py-3.5 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-xl text-sm font-bold hover:bg-[var(--accent-brown-hover)] active:scale-95 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(192,160,128,0.2)]"
                            >
                                {isCheckingOut ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                Devenir Premium
                            </button>
                        )}
                        <p className="text-xs text-[var(--text-secondary)] opacity-60">Annulation à tout moment via Stripe</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
