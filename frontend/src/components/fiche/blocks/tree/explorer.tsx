'use client';

/**
 * Arbres de talents du personnage : arbres ouverts en onglets, arbres encore fermés
 * consultables (et débloquables par l'achat de l'entrée qui les ouvre), grille du choisi et
 * détail d'un nœud (achat, remboursement). Vue Progression du bloc Compétences, quand le
 * système déclare des arbres.
 */
import { ChevronDown, GitBranch, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ContexteFiche } from '../../widgets';
import { TreeDetailDialog, type TreeSelection } from './detail-dialog';
import { GridTree } from './grid-tree';
import { currencyName, type TreeView } from './model';
import type { SheetWrites } from './writes';

export function TreeExplorer({
  ctx,
  trees,
  writes,
  className,
}: {
  ctx: ContexteFiche;
  /** Arbres du système (`buildTrees`). */
  trees: TreeView[];
  writes: SheetWrites | undefined;
  className?: string;
}) {
  const views = useMemo(() => trees.filter((t) => t.open || t.owned > 0), [trees]);
  const closed = useMemo(() => trees.filter((t) => !t.open && t.owned === 0), [trees]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<TreeSelection | null>(null);

  const preview = closed.find((t) => t.tree.id === selectedId);
  const current: TreeView | undefined =
    preview ?? views.find((v) => v.tree.id === selectedId) ?? views[0];

  const cur = (id: string | undefined) => currencyName(ctx.systeme, id);

  if (!views.length && !closed.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
        <GitBranch className="size-6 text-subtle" />
        <p className="text-sm text-muted-foreground">
          Ce système ne déclare aucun arbre pour ce personnage.
        </p>
      </div>
    );

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3', className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-0.5">
          {views.map((v) => {
            const on = current?.tree.id === v.tree.id;
            return (
              <button
                key={v.tree.id}
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedId(v.tree.id)}
                className={cn(
                  'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                  on
                    ? 'bg-surface-3 text-foreground shadow-surface'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <GitBranch className="size-3.5" />
                {v.tree.nom}
                <span className="font-mono text-[11px] tabular text-subtle">{v.owned}</span>
              </button>
            );
          })}
          {preview && (
            <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-surface-3 px-2.5 text-[13px] font-medium">
              <Lock className="size-3.5 text-subtle" />
              {preview.tree.nom}
            </span>
          )}
          {!views.length && !preview && (
            <span className="px-2.5 py-1 text-[13px] text-muted-foreground">
              Aucun arbre ouvert
            </span>
          )}
        </div>
        {closed.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="xs">
                Autres arbres
                <span className="font-mono tabular text-subtle">{closed.length}</span>
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
              <DropdownMenuLabel>Arbres fermés</DropdownMenuLabel>
              {closed.map((t) => (
                <DropdownMenuItem key={t.tree.id} onSelect={() => setSelectedId(t.tree.id)}>
                  <span className="min-w-0 flex-1 truncate">{t.tree.nom}</span>
                  {t.openerOffer && (
                    <span
                      className={cn(
                        'font-mono text-[11px] tabular',
                        t.openerOffer.possible ? 'text-success' : 'text-subtle',
                      )}
                    >
                      {t.openerOffer.cout}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {preview && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[13px]">
          <span className="text-muted-foreground">
            Arbre fermé{preview.opener ? ` : nécessite « ${preview.opener.nom} »` : ''}.
            {preview.openerOffer && !preview.openerOffer.possible && (
              <span className="text-warning">
                {' '}
                {preview.openerOffer.blocages.map((b) => b.message).join(' · ')}
              </span>
            )}
          </span>
          {writes && preview.openerOffer && (
            <Button
              size="xs"
              disabled={!preview.openerOffer.possible}
              onClick={() => writes.buy(preview.openerOffer!.achat, preview.openerOffer!.objet)}
            >
              Débloquer · {preview.openerOffer.cout} {cur(preview.openerOffer.monnaie)}
            </Button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {current && (
          <GridTree
            key={current.tree.id}
            view={current}
            geometry={ctx.presentation?.arbres}
            currencyName={cur}
            onSelect={(node) => setSelection({ kind: 'node', tree: current, node })}
          />
        )}
      </div>

      <TreeDetailDialog
        ctx={ctx}
        writes={writes}
        selection={selection}
        onClose={() => setSelection(null)}
      />
    </div>
  );
}
