'use client';

/**
 * Choix du skin de dés, repris de la boutique de l'ancienne app (store-modal)
 * SANS la boutique : seulement « Mon Sac » (skins de l'inventaire du service
 * des dés et skins gratuits), recherche, rareté, page de détail 3D et essai.
 * L'achat et l'abonnement arriveront avec le service billing.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { DICE_SKINS, type DiceSkin } from '@/components/(dices)/dice-definitions';
import type { FunDiceHandle } from '@/components/(dices)/throw-fun';
import { DiceCard } from './dice-card';
import { DiceDetail } from './dice-detail';
import { Backpack, X, Loader2, Package, Search, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from './toast';
import { ownedSkins, useDicePreferences } from './use-dice-preferences';

// Canevas WebGL chargé seulement au premier « Essayer » (sans rendu serveur)
const FunDiceThrower = dynamic(() => import('@/components/(dices)/throw-fun'), { ssr: false });

type TabId = 'inventory';
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
  const activeTab: TabId = 'inventory';
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // --- User state : préférences du service des dés (inventaire, skin) ---
  const { prefs, loaded, update } = useDicePreferences();
  const diceInventory = useMemo(() => ownedSkins(prefs), [prefs]);

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
  const handleEquipDice = async (skinId: string) => {
    if (onSelectDiceSkin) onSelectDiceSkin(skinId);
    await update({ skinId });
    toast.success('Dés équipés');
  };

  // --- Data ---
  const allDiceSkins = useMemo(() => Object.values(DICE_SKINS), []);

  const ownsDice = (id: string) => diceInventory.includes(id);

  type StoreItem = { type: 'dice'; data: DiceSkin };

  // Build the visible item list : « Mon Sac » seulement (pas de boutique).
  const buildItems = (): StoreItem[] => {
    const q = searchQuery.trim().toLowerCase();
    const rarityOk = (r?: string) => rarityFilter === 'all' || (r || 'common') === rarityFilter;
    const items: StoreItem[] = [];

    allDiceSkins.forEach((s) => {
      if (!ownsDice(s.id)) return;
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
    () => buildItems(),
    // buildItems est une closure recréée à chaque render ; ses entrées réelles sont listées ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rarityFilter, searchQuery, allDiceSkins, diceInventory],
  );
  const totalPages = Math.ceil(displayItems.length / itemsPerPage);
  const paginatedItems = displayItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    setCurrentPage(1);
    document.getElementById('store-modal-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [rarityFilter, searchQuery]);

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
      onBuy={() => {}}
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
            <Backpack className="w-5 h-5 text-[var(--accent-brown)]" />
          </div>
          <div className="min-w-0 mr-auto">
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] truncate">
                Mon Sac
              </h2>
            </div>
            <p className="hidden sm:block text-sm text-[var(--text-secondary)]">
              Choisissez le skin de vos dés
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-lg hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ===== TOOLBAR (search + filters) — hidden on Premium tab & detail page ===== */}
        {!detailSkin && (
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
                {detailSkin ? (
                  <DiceDetail
                    skin={detailSkin}
                    isOwned={ownsDice(detailSkin.id)}
                    isEquipped={equippedId === detailSkin.id}
                    canAfford={false}
                    onBack={() => setDetailSkin(null)}
                    onBuy={() => {}}
                    onEquip={() => handleEquipDice(detailSkin.id)}
                    onTry={() => tryDice(detailSkin.id)}
                  />
                ) : (
                  <>
                    {paginatedItems.length === 0 ? (
                      <EmptyState tab={activeTab} />
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

function EmptyState({ tab }: { tab: TabId }) {
  const message =
    tab === 'inventory'
      ? 'Aucun dé ne correspond à votre recherche.'
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
