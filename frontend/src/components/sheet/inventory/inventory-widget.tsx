'use client';

/**
 * Inventaire : possessions des sortes activables (équipement), rangées par
 * sorte, avec la bourse en tête. Reprend l'ergonomie de l'ancien inventaire
 * (grille de cartes, recherche, catégories, fiche d'objet, bonus d'objet)
 * sur les données du service character, sans aucune clé de jeu.
 */
import { Plus, Search } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  card,
  field,
  iconButton,
  secondaryButton,
  text,
  textAccent,
  textMuted,
  titleFont,
} from '../styles';
import { themeVariables } from '../theme';
import { CatalogueDialog, KindFilter } from './catalogue-dialog';
import { ItemCard } from './item-card';
import { ItemDialog } from './item-dialog';
import { equipmentKinds, fieldSummary } from './model';
import { Purse } from './purse';
import type { InventoryWidgetProps } from './types';
import { InventoryProvider, normalize, useInventory, type InventoryContextValue } from './ui';

export function InventoryWidget(props: InventoryWidgetProps) {
  const { system, presentation, state, kinds: kindIds } = props;
  const kinds = useMemo(() => {
    const all = equipmentKinds(system, state.type);
    if (!kindIds) return all;
    return kindIds.flatMap((id) => {
      const s = system.sortes.get(id);
      return s && s.pour.includes(state.type) ? [s] : [];
    });
  }, [system, state.type, kindIds]);
  const variables = useMemo(() => themeVariables(presentation), [presentation]);
  const value: InventoryContextValue = { ...props, kinds, variables };
  return (
    <InventoryProvider value={value}>
      <Inventory />
    </InventoryProvider>
  );
}

function Inventory() {
  const { title, system, sheet, state, readOnly, kinds, showPurse = true } = useInventory();
  const titleId = useId();
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [equippedOnly, setEquippedOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ kind?: string } | null>(null);

  const kindIds = new Set(kinds.map((k) => k.id));
  const owned = [...sheet.possessions.values()]
    .filter((p) => kindIds.has(p.sorte.id))
    .sort((a, b) => a.entree.nom.localeCompare(b.entree.nom, 'fr'));
  const equipped = owned.filter((p) => p.actif).length;
  const counts = new Map<string, number>();
  for (const p of owned) counts.set(p.sorte.id, (counts.get(p.sorte.id) ?? 0) + 1);

  // La recherche porte aussi sur le résumé des champs (« Crit 3 », une compétence…)
  const query = normalize(search.trim());
  const visible = owned.filter(
    (p) =>
      (!kindFilter || p.sorte.id === kindFilter) &&
      (!equippedOnly || p.actif) &&
      (!query ||
        normalize(p.entree.nom).includes(query) ||
        normalize(
          fieldSummary(system, state.type, state, p.entree, p.sorte, 20).join(' '),
        ).includes(query)),
  );
  const openKind = open ? system.sortes.get(system.entrees.get(open)?.sorte ?? '') : undefined;

  return (
    <section aria-labelledby={titleId} className={cn(card, 'space-y-3')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id={titleId}
          className={cn(titleFont, textAccent, 'text-base tracking-wide sm:text-lg')}
        >
          {title ?? 'Inventaire'}
        </h2>
        <div className="flex items-center gap-2">
          {owned.length > 0 && (
            <span className={cn(textMuted, 'text-xs tabular-nums')}>
              {owned.length} objet{owned.length > 1 ? 's' : ''} · {equipped} équipé
              {equipped > 1 ? 's' : ''}
            </span>
          )}
          {!readOnly && kinds.length > 0 && (
            <button
              type="button"
              className={cn(secondaryButton, 'min-h-8 px-2.5 text-xs')}
              onClick={() => setAdding({})}
            >
              <Plus />
              Ajouter
            </button>
          )}
        </div>
      </div>

      {showPurse && <Purse />}

      {!kinds.length ? (
        <Empty>Ce système ne déclare pas d&apos;équipement pour ce type d&apos;entité.</Empty>
      ) : !owned.length ? (
        <Empty>
          L&apos;inventaire est vide.
          {!readOnly && (
            <button
              type="button"
              className={cn(secondaryButton, 'mx-auto mt-3 flex')}
              onClick={() => setAdding({})}
            >
              <Plus />
              Ajouter depuis le catalogue
            </button>
          )}
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search
                className={cn(textMuted, 'pointer-events-none absolute left-3 top-2.5 h-4 w-4')}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher"
                aria-label="Rechercher dans l'inventaire"
                className={cn(field, 'pl-9 text-base sm:text-sm')}
              />
            </div>
            <label className={cn(text, 'flex items-center gap-2 text-xs')}>
              <input
                type="checkbox"
                checked={equippedOnly}
                onChange={(e) => setEquippedOnly(e.target.checked)}
                className="h-4 w-4 accent-[color:var(--fiche-accent)]"
              />
              Équipés seulement
            </label>
          </div>
          {kinds.length > 1 && (
            <KindFilter
              kinds={kinds.filter((k) => counts.has(k.id))}
              value={kindFilter}
              onChange={setKindFilter}
              counts={counts}
            />
          )}

          {visible.length ? (
            <div className="space-y-4">
              {kinds.map((k) => {
                const list = visible.filter((p) => p.sorte.id === k.id);
                if (!list.length) return null;
                return (
                  <section key={k.id} aria-label={k.nomPluriel ?? k.nom}>
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className={cn(textAccent, 'text-xs font-bold uppercase tracking-wider')}>
                        {k.nomPluriel ?? k.nom}
                      </h3>
                      <span className="h-px flex-1 bg-[color:var(--fiche-bordure)]" />
                      <span className={cn(textMuted, 'text-xs tabular-nums')}>{list.length}</span>
                      {!readOnly && (
                        <button
                          type="button"
                          className={cn(iconButton, 'h-7 w-7')}
                          aria-label={`Ajouter : ${k.nomPluriel ?? k.nom}`}
                          title={`Ajouter : ${k.nomPluriel ?? k.nom}`}
                          onClick={() => setAdding({ kind: k.id })}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
                      {list.map((p) => (
                        <ItemCard
                          key={p.entree.id}
                          entry={p.entree}
                          kind={p.sorte}
                          onOpen={() => setOpen(p.entree.id)}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <Empty>Aucun objet ne correspond.</Empty>
          )}
        </>
      )}

      {open && openKind && (
        <ItemDialog entry={open} kind={openKind} onClose={() => setOpen(null)} />
      )}
      {adding && <CatalogueDialog initialKind={adding.kind} onClose={() => setAdding(null)} />}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        textMuted,
        'rounded-lg border border-dashed border-[color:var(--fiche-bordure)] px-3 py-4 text-center text-sm',
      )}
    >
      {children}
    </div>
  );
}
