'use client';

/**
 * Boutique de l'ancienne app (`legacy/src/components/store/store-modal.tsx`) :
 * même structure, même rendu (Catalogue, Mon Sac, Premium ; recherche,
 * rareté, pagination, page de détail 3D, « Essayer »). Seuls changent :
 *
 * - inventaire, skin équipé et premium : préférences du service des dés
 *   (`useDicePreferences`, docs/api-dice.md) au lieu du document Firestore
 *   `users/{uid}` ; un dé est possédé avec `allSkins` (premium de l'ancienne
 *   app), s'il est dans l'inventaire ou s'il est gratuit ;
 * - achat, abonnement et portail Stripe : pas encore de service billing, les
 *   boutons restent affichés, désactivés (« Bientôt disponible ») ;
 * - cadres de jetons (onglet « Cadres ») : masqués, leur inventaire et le cadre
 *   équipé n'ont pas encore de service ;
 * - commandes de développement `give_dice` / `give_token` : retirées (écriture
 *   directe dans Firestore).
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { DICE_SKINS, type DiceSkin } from '@/components/(dices)/dice-definitions';
import type { FunDiceHandle } from '@/components/(dices)/throw-fun';
import { DiceCard } from './dice-card';
import { DiceDetail } from './dice-detail';
import {
  Store,
  Backpack,
  X,
  Loader2,
  Crown,
  Dice5,
  Package,
  Settings,
  Sparkles,
  Search,
  ChevronDown,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from './toast';
import { ownedSkins, useDicePreferences } from './use-dice-preferences';

// Canevas WebGL chargé seulement au premier « Essayer » (sans rendu serveur)
const FunDiceThrower = dynamic(() => import('@/components/(dices)/throw-fun'), { ssr: false });

type TabId = 'catalog' | 'inventory' | 'premium';
type RarityFilter = 'all' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

const RARITY_OPTIONS: { id: RarityFilter; label: string; color: string }[] = [
  { id: 'all', label: 'Toutes raretés', color: 'var(--text-primary)' },
  { id: 'legendary', label: 'Légendaire', color: 'var(--accent-brown)' },
  { id: 'epic', label: 'Épique', color: 'var(--accent-blue)' },
  { id: 'rare', label: 'Rare', color: '#3b82f6' },
  { id: 'uncommon', label: 'Peu commun', color: '#22c55e' },
  { id: 'common', label: 'Commun', color: '#9ca3af' },
];
const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

/** Achat et abonnement : en attente du service billing. */
const COMING_SOON = 'Bientôt disponible';

interface StoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDiceSkinId?: string;
  onSelectDiceSkin?: (skinId: string) => void;
}

export function StoreModal({
  isOpen,
  onClose,
  currentDiceSkinId,
  onSelectDiceSkin,
}: StoreModalProps) {
  // --- View state ---
  const [activeTab, setActiveTab] = useState<TabId>('catalog');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // --- User state : préférences du service des dés (inventaire, premium, skin) ---
  const { prefs, loaded, update } = useDicePreferences();
  const isPremium = prefs.allSkins;
  const diceInventory = useMemo(() => new Set(ownedSkins(prefs)), [prefs]);

  // --- UI state ---
  const [mounted, setMounted] = useState(false);
  const isLoadingInventory = !loaded;
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [rarityOpen, setRarityOpen] = useState(false);
  const rarityRef = useRef<HTMLDivElement>(null);

  // Page de détail d'un dé (le seul endroit avec de la 3D dans la boutique)
  const [detailSkin, setDetailSkin] = useState<DiceSkin | null>(null);

  // "Try it" dice thrower — monté UNIQUEMENT au premier clic "Essayer".
  // (Avant : monté 800ms après chaque ouverture → warm-up shaders plein
  // écran en frameloop 'always' pendant ~4s à CHAQUE ouverture, même pour
  // juste feuilleter le catalogue.) La file pendingRolls de FunDiceThrower
  // absorbe l'attente du warm-up déclenché par ce premier clic.
  const funDiceRef = useRef<FunDiceHandle>(null);
  const [throwerMounted, setThrowerMounted] = useState(false);
  const pendingTryRef = useRef<string | null>(null);
  const tryDice = (skinId: string) => {
    if (funDiceRef.current) {
      funDiceRef.current.roll(skinId, 'd20');
      return;
    }
    pendingTryRef.current = skinId;
    setThrowerMounted(true);
  };
  useEffect(() => {
    if (throwerMounted && pendingTryRef.current) {
      funDiceRef.current?.roll(pendingTryRef.current, 'd20');
      pendingTryRef.current = null;
    }
  }, [throwerMounted]);

  // Fermeture du modal = on tue tout (canvas 3D du détail ET lanceur)
  useEffect(() => {
    if (!isOpen) {
      setDetailSkin(null);
      setThrowerMounted(false);
      pendingTryRef.current = null;
    }
  }, [isOpen]);

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

  useEffect(() => {
    setMounted(true);
  }, []);

  // Esc : quitte d'abord la page de détail, puis ferme le modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (detailSkin) {
        setDetailSkin(null);
        return;
      }
      onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, detailSkin]);

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
  // Achat : pas encore de service billing (les boutons sont désactivés).
  const handleBuyItem = () => {
    toast.info(`Achat : ${COMING_SOON.toLowerCase()}`);
  };

  const handleEquipDice = async (skinId: string) => {
    if (onSelectDiceSkin) onSelectDiceSkin(skinId);
    if (await update({ skinId })) toast.success('Dés équipés');
    else toast.error("Impossible d'équiper ces dés");
  };

  // --- Data ---
  const allDiceSkins = useMemo(() => Object.values(DICE_SKINS), []);

  // Ownership helpers (premium owns everything).
  const ownsDice = (id: string) => diceInventory.has(id);

  type StoreItem = { type: 'dice'; data: DiceSkin };

  // Build the visible item list. `ownedOnly` = the "Mon Sac" tab.
  const buildItems = (ownedOnly: boolean): StoreItem[] => {
    const q = searchQuery.trim().toLowerCase();
    const rarityOk = (r?: string) => rarityFilter === 'all' || (r || 'common') === rarityFilter;
    const items: StoreItem[] = [];

    allDiceSkins.forEach((s) => {
      if (ownedOnly && !ownsDice(s.id)) return;
      if (!rarityOk(s.rarity)) return;
      if (q && !s.name.toLowerCase().includes(q)) return;
      items.push({ type: 'dice', data: s });
    });
    // Highest rarity first.
    return items.sort(
      (a, b) =>
        (RARITY_ORDER[b.data.rarity || 'common'] ?? 0) -
        (RARITY_ORDER[a.data.rarity || 'common'] ?? 0),
    );
  };

  const displayItems = useMemo(
    () => (activeTab === 'premium' ? [] : buildItems(activeTab === 'inventory')),
    // buildItems est une closure recréée à chaque render ; ses entrées réelles sont listées ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, rarityFilter, searchQuery, allDiceSkins, diceInventory],
  );
  const totalPages = Math.ceil(displayItems.length / itemsPerPage);
  const paginatedItems = displayItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    setCurrentPage(1);
    document.getElementById('store-modal-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab, rarityFilter, searchQuery]);

  const handlePageChange = (p: number) => {
    setCurrentPage(p);
    document.getElementById('store-modal-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!mounted || !shouldRender) return null;

  const activeRarity = RARITY_OPTIONS.find((o) => o.id === rarityFilter)!;

  const equippedId = currentDiceSkinId ?? prefs.skinId;
  const renderCard = (item: StoreItem) => (
    <DiceCard
      skin={item.data}
      isOwned={ownsDice(item.data.id)}
      isEquipped={equippedId === item.data.id}
      canAfford={false}
      comingSoon
      onBuy={handleBuyItem}
      onEquip={() => handleEquipDice(item.data.id)}
      onOpen={() => setDetailSkin(item.data)}
    />
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4"
      style={{
        pointerEvents: isVisible ? 'auto' : 'none',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}
    >
      {/* Assombrissement simple : pas de backdrop-blur plein écran — en room,
                la carte continue de tourner derrière et le blur se repayait à chaque frame. */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="relative z-10 w-full max-w-6xl h-[92vh] max-h-[900px] flex flex-col overflow-hidden rounded-2xl shadow-2xl border border-[var(--border-color)] bg-[var(--bg-dark)] text-[var(--text-primary)]"
        style={{
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.98) translateY(10px)',
          transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== HEADER ===== */}
        <div
          className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-[var(--border-color)] backdrop-blur-md"
          style={{ background: 'color-mix(in srgb, var(--bg-card) 80%, transparent)' }}
        >
          <div
            className="w-10 h-10 shrink-0 rounded-xl border border-[var(--border-color)] flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--accent-brown) 10%, transparent)' }}
          >
            <Store className="w-5 h-5 text-[var(--accent-brown)]" />
          </div>
          <div className="min-w-0 mr-auto">
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] truncate">
                Boutique
              </h2>
              {isPremium && (
                <span
                  className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-[var(--accent-brown)]"
                  style={{
                    background: 'color-mix(in srgb, var(--accent-brown) 15%, transparent)',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: 'color-mix(in srgb, var(--accent-brown) 30%, transparent)',
                  }}
                >
                  <Crown className="w-3 h-3" /> Premium
                </span>
              )}
            </div>
            <p className="hidden sm:block text-sm text-[var(--text-secondary)]">
              {isPremium ? 'Accès total débloqué' : 'Personnalisez vos dés'}
            </p>
          </div>

          {/* Tabs */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl border border-[var(--border-color)]"
            style={{ background: 'color-mix(in srgb, var(--bg-darker) 60%, transparent)' }}
          >
            {(
              [
                { id: 'catalog', label: 'Catalogue', Icon: Store },
                { id: 'inventory', label: 'Mon Sac', Icon: Backpack },
                { id: 'premium', label: 'Premium', Icon: Crown },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setDetailSkin(null);
                  setActiveTab(id);
                }}
                className={cn(
                  'flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors',
                  activeTab === id
                    ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] shadow'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ===== TOOLBAR (search + filters) — hidden on Premium tab & detail page ===== */}
        {activeTab !== 'premium' && !detailSkin && (
          <div
            className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-3 border-b border-[var(--border-color)]"
            style={{ background: 'color-mix(in srgb, var(--bg-darker) 40%, transparent)' }}
          >
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-dark)] border border-[var(--border-color)] focus-within:border-[color-mix(in_srgb,var(--accent-brown)_50%,transparent)] transition-colors sm:w-64">
              <Search className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
              <input
                type="text"
                placeholder="Chercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none min-w-0"
              />
            </div>

            {/* Rarity dropdown */}
            <div ref={rarityRef} className="relative sm:ml-auto">
              <button
                onClick={() => setRarityOpen((o) => !o)}
                className="w-full sm:w-48 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--bg-dark)] border border-[var(--border-color)] hover:border-[color-mix(in_srgb,var(--text-primary)_20%,transparent)] transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: activeRarity.color }}
                  />
                  <span
                    className="text-sm font-bold truncate"
                    style={{
                      color: rarityFilter === 'all' ? 'var(--text-secondary)' : activeRarity.color,
                    }}
                  >
                    {activeRarity.label}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-[var(--text-secondary)] transition-transform shrink-0',
                    rarityOpen && 'rotate-180',
                  )}
                />
              </button>
              {rarityOpen && (
                <div className="absolute z-30 right-0 mt-2 w-full sm:w-48 rounded-xl border border-[var(--border-color)] bg-[var(--bg-dark)] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                  {RARITY_OPTIONS.map(({ id, label, color }) => (
                    <button
                      key={id}
                      onClick={() => {
                        setRarityFilter(id);
                        setRarityOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-left transition-colors',
                        rarityFilter === id
                          ? ''
                          : 'hover:bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)]',
                      )}
                      style={{
                        color,
                        ...(rarityFilter === id
                          ? {
                              background:
                                'color-mix(in srgb, var(--text-primary) 10%, transparent)',
                            }
                          : {}),
                      }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
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
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Chargement...
              </span>
            </div>
          ) : (
            <div
              className="h-full overflow-y-auto custom-scrollbar"
              id="store-modal-scroll-area"
              style={{ touchAction: 'pan-y' }}
            >
              <div className="p-4 sm:p-6">
                {activeTab === 'premium' ? (
                  <PremiumPanel isPremium={isPremium} />
                ) : detailSkin ? (
                  <DiceDetail
                    skin={detailSkin}
                    isOwned={ownsDice(detailSkin.id)}
                    isEquipped={equippedId === detailSkin.id}
                    canAfford={false}
                    comingSoon
                    onBack={() => setDetailSkin(null)}
                    onBuy={handleBuyItem}
                    onEquip={() => handleEquipDice(detailSkin.id)}
                    onTry={() => tryDice(detailSkin.id)}
                  />
                ) : (
                  <>
                    {/* Hero (Catalogue only, not the bag) */}
                    {activeTab === 'catalog' && !searchQuery && rarityFilter === 'all' && (
                      <CatalogHero
                        isPremium={isPremium}
                        onCta={() =>
                          isPremium ? setActiveTab('inventory') : setActiveTab('premium')
                        }
                      />
                    )}

                    {paginatedItems.length === 0 ? (
                      <EmptyState tab={activeTab} isPremium={isPremium} />
                    ) : (
                      <>
                        {/* Pas d'animation de montage sur les cartes : la double couche
                                                    animate-in + framer-motion re-rasterisait 8 sous-arbres à
                                                    chaque changement de page. */}
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
                          {paginatedItems.map((item) => (
                            <div key={`${item.type}-${item.data.id}`}>{renderCard(item)}</div>
                          ))}
                        </div>

                        {totalPages > 1 && (
                          <Pagination
                            current={currentPage}
                            total={totalPages}
                            onChange={handlePageChange}
                          />
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

      {throwerMounted && <FunDiceThrower ref={funDiceRef} hideButton overlayZIndex={10010} />}
    </div>,
    document.body,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function CatalogHero({ isPremium, onCta }: { isPremium: boolean; onCta: () => void }) {
  return (
    <div className="relative mb-6 rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--accent-brown)_30%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent-brown)_20%,transparent)] via-[var(--bg-dark)] to-[var(--bg-darker)] p-6 sm:p-8">
      <div className="absolute -top-6 -right-6 opacity-[0.06] rotate-12">
        <Crown className="w-56 h-56 text-[var(--accent-brown)]" />
      </div>
      <div className="relative z-10 flex flex-col items-start gap-4 max-w-lg">
        <span
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-[var(--accent-brown)]"
          style={{
            background: 'color-mix(in srgb, var(--accent-brown) 15%, transparent)',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'color-mix(in srgb, var(--accent-brown) 30%, transparent)',
          }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {isPremium ? 'Membre Premium' : 'Collection légendaire'}
        </span>
        <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] leading-tight">
          {isPremium ? 'Tous les trésors sont à vous' : 'Équipez des dés uniques'}
        </h3>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
          {isPremium
            ? 'Équipez librement tout le catalogue, présent et à venir.'
            : 'Des dés 3D animés — trouvez la pièce qui vous ressemble, ou débloquez tout avec Premium.'}
        </p>
        <button
          onClick={onCta}
          className="mt-1 px-6 py-3 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-xl text-sm font-bold hover:bg-[var(--accent-brown-hover)] active:scale-95 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(192,160,128,0.2)]"
        >
          {isPremium ? (
            <>
              <Backpack className="w-4 h-4" /> Voir mon sac
            </>
          ) : (
            <>
              <Crown className="w-4 h-4" /> Découvrir Premium
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ tab, isPremium }: { tab: TabId; isPremium: boolean }) {
  const message =
    tab === 'inventory'
      ? 'Votre sac est vide. Débloquez des dés pour les retrouver ici.'
      : isPremium
        ? 'Aucun objet ne correspond à ces filtres.'
        : 'Aucun objet ne correspond à votre recherche.';
  return (
    <div className="py-24 flex flex-col items-center gap-4 text-center opacity-50">
      <Package className="w-14 h-14 text-[var(--text-secondary)]" />
      <p className="text-sm font-medium text-[var(--text-secondary)] max-w-xs">{message}</p>
    </div>
  );
}

function Pagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (p: number) => void;
}) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-8 mt-6 border-t"
      style={{ borderColor: 'color-mix(in srgb, var(--border-color) 40%, transparent)' }}
    >
      <button
        onClick={() => onChange(current - 1)}
        disabled={current === 1}
        className="px-4 py-2 text-sm font-bold rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
      >
        <span className="hidden sm:inline">Précédent</span>
        <span className="sm:hidden">‹</span>
      </button>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[45vw] sm:max-w-none">
        {Array.from({ length: total }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            onClick={() => onChange(page)}
            className={cn(
              'w-9 h-9 text-sm font-bold rounded-lg border transition-colors shrink-0',
              current === page
                ? 'bg-[var(--accent-brown)] text-[var(--bg-dark)] border-[var(--accent-brown)]'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-white/5',
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
        <span className="hidden sm:inline">Suivant</span>
        <span className="sm:hidden">›</span>
      </button>
    </div>
  );
}

/** Abonnement : pas encore de service billing, boutons désactivés. */
function PremiumPanel({ isPremium }: { isPremium: boolean }) {
  const benefits = [
    { Icon: Dice5, text: 'Tous les dés 3D animés débloqués' },
    { Icon: Package, text: 'Accès aux futurs contenus' },
    { Icon: Sparkles, text: 'Soutenez le développement' },
  ];
  return (
    <div className="max-w-2xl mx-auto">
      <div className="relative rounded-2xl overflow-hidden border border-[color-mix(in_srgb,var(--accent-brown)_30%,transparent)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent-brown)_15%,transparent)] via-[var(--bg-dark)] to-[var(--bg-darker)] p-6 sm:p-10 text-center">
        <div className="absolute -top-8 -right-8 opacity-[0.08] rotate-12">
          <Crown className="w-64 h-64 text-[var(--accent-brown)]" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: 'color-mix(in srgb, var(--accent-brown) 15%, transparent)',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: 'color-mix(in srgb, var(--accent-brown) 25%, transparent)',
            }}
          >
            <Crown className="w-8 h-8 text-[var(--accent-brown)]" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
              Abonnement Premium
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              L&apos;expérience complète, sans limites
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
            {benefits.map(({ Icon, text }, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]"
              >
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
                disabled
                title={COMING_SOON}
                className="px-8 py-3.5 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-xl text-sm font-bold hover:bg-[var(--accent-brown-hover)] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--accent-brown)] disabled:active:scale-100"
              >
                <Settings className="w-5 h-5" />
                Gérer l&apos;abonnement
              </button>
            ) : (
              <button
                disabled
                title={COMING_SOON}
                className="px-8 py-3.5 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-xl text-sm font-bold hover:bg-[var(--accent-brown-hover)] active:scale-95 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(192,160,128,0.2)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--accent-brown)] disabled:active:scale-100"
              >
                <Sparkles className="w-5 h-5" />
                Devenir Premium
              </button>
            )}
            <p className="-mt-2 text-xs font-bold uppercase tracking-widest text-[var(--accent-brown)]">
              {COMING_SOON}
            </p>
            <p className="text-xs text-[var(--text-secondary)] opacity-60">
              Annulation à tout moment via Stripe
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
