'use client';

/**
 * Bloc Compétences en cartes : entrées d'une sorte du système (capacités, talents,
 * compétences) en grille compacte. Pastille et accent pour une entrée active (sorte
 * `activable`), bonus appliqués en étiquettes, effets de jet, recherche, filtres par la valeur
 * du champ `filtreChamp` (ou par étiquette), détail en fenêtre avec activation et achat de
 * rang. Un indicateur de points apparaît quand un achat vise la sorte ; si elle s'obtient par
 * une voie ou un arbre, il ouvre l'arbre.
 */
import { Coins, Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { TreeExplorer } from '../tree/explorer';
import { sheetWrites } from '../tree/writes';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';
import { BlockShell } from './block-shell';
import { buildSkills, matchesFilter, type Progress } from './model';
import { SkillCardView, SkillDialog } from './parts';

/** Texte comparable : minuscules, sans accents. */
function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function ProgressChip({ p, onOpen }: { p: Progress; onOpen?: () => void }) {
  const content = (
    <>
      <Coins className="size-3.5 text-primary" />
      <span className="font-mono font-semibold tabular">{p.balance}</span>
      <span className="hidden text-subtle sm:inline">{p.currencyName}</span>
      {p.possible > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success)/0.8)]"
          aria-hidden
        />
      )}
    </>
  );
  const cls =
    'relative flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 text-[12px]';
  const tip = `${p.balance} ${p.currencyName} à dépenser${
    p.possible > 0 ? ` · ${p.possible} achat(s) possible(s)` : ''
  }${onOpen ? ' · ouvrir la progression' : ''}`;
  return (
    <Info texte={tip}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(cls, 'transition-colors hover:border-primary/50 hover:bg-surface-3')}
        >
          {content}
        </button>
      ) : (
        <span className={cls}>{content}</span>
      )}
    </Info>
  );
}

function SkillsBlock({ ctx, widget, mode }: SheetBlockProps<'competences'>) {
  const data = useMemo(
    () => buildSkills(ctx.fiche, widget.sorte, widget.filtreChamp),
    [ctx.fiche, widget.sorte, widget.filtreChamp],
  );
  const writes = sheetWrites(ctx, mode);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const [filter, setFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = plain(deferred.trim());
    return data.cards.filter(
      (c) =>
        matchesFilter(c, filter, !!widget.filtreChamp) &&
        (!q ||
          plain(
            [
              c.entry.nom,
              c.entry.description ?? '',
              c.filter?.label ?? '',
              ...c.bonuses.map((b) => b.label),
            ].join(' '),
          ).includes(q)),
    );
  }, [data, deferred, filter, widget.filtreChamp]);

  if (!data)
    return (
      <BlockShell title={widget.titre}>
        <p className="text-sm text-muted-foreground">Sorte inconnue du système.</p>
      </BlockShell>
    );

  const selected = data.cards.find((c) => c.entry.id === selectedId) ?? null;
  const hasTree = data.progress.some((p) => p.viaTree);

  return (
    <>
      <BlockShell
        title={widget.titre}
        count={data.cards.length}
        actions={data.progress.map((p) => (
          <ProgressChip
            key={p.currency}
            p={p}
            {...(p.viaTree ? { onOpen: () => setTreeOpen(true) } : {})}
          />
        ))}
        toolbar={
          data.cards.length > 0 ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher…"
                  aria-label={`Rechercher dans ${widget.titre}`}
                  className="h-8 w-full rounded-lg border border-input bg-surface-2/60 pl-8 pr-8 text-[13px] text-foreground placeholder:text-subtle focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 [&::-webkit-search-cancel-button]:hidden"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-foreground"
                    aria-label="Effacer la recherche"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {data.filters.length > 0 && (
                <div
                  className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5"
                  role="group"
                  aria-label={data.filterLabel ?? 'Filtres'}
                >
                  {[{ key: null, label: 'Toutes', count: data.cards.length }, ...data.filters].map(
                    (f) => {
                      const on = filter === f.key;
                      return (
                        <button
                          key={f.key ?? '*'}
                          type="button"
                          onClick={() => setFilter(on && f.key !== null ? null : f.key)}
                          className={cn(
                            'flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                            on
                              ? 'border-primary/40 bg-primary/10 text-primary-strong'
                              : 'border-border-strong text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {f.label}
                          <span className="font-mono tabular opacity-60">{f.count}</span>
                        </button>
                      );
                    },
                  )}
                </div>
              )}
            </>
          ) : undefined
        }
      >
        {data.cards.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune entrée « {data.sorte.nomPluriel ?? data.sorte.nom} » pour l’instant.
            {hasTree && ' Elles s’obtiennent par la progression (indicateur de points).'}
          </p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat.</p>
        ) : (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(11.5rem,1fr))]">
            {visible.map((c) => (
              <SkillCardView
                key={c.entry.id}
                card={c}
                ctx={ctx}
                writes={writes}
                onOpen={() => setSelectedId(c.entry.id)}
              />
            ))}
          </div>
        )}
      </BlockShell>

      <SkillDialog ctx={ctx} card={selected} writes={writes} onClose={() => setSelectedId(null)} />

      {hasTree && (
        <Dialog open={treeOpen} onOpenChange={setTreeOpen}>
          <DialogContent className="flex h-[85dvh] flex-col gap-3 sm:max-w-6xl">
            <DialogTitle>Progression</DialogTitle>
            <DialogDescription className="sr-only">
              Voies et arbres du personnage, achats et remboursements.
            </DialogDescription>
            <div className="min-h-0 flex-1">
              <TreeExplorer ctx={ctx} writes={writes} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export const skillsBlock: SheetBlockDefinition<'competences'> = {
  type: 'competences',
  label: 'Compétences',
  description: 'Capacités et talents en cartes : actives, bonus, recherche, filtres.',
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 3, h: 4 },
  Component: SkillsBlock,
};
