'use client';

/**
 * Navigation dans la progression du personnage : groupes de voies et arbres ouverts en
 * onglets, arbres encore fermés consultables (et débloquables par l'achat de l'entrée qui les
 * ouvre), soldes des monnaies dépensées. Utilisé par le bloc Arbre et par le bloc Compétences
 * (fenêtre ouverte depuis l'indicateur de points).
 */
import { solde } from '@vtt/rules';
import { ChevronDown, Coins, GitBranch, Lock, Route } from 'lucide-react';
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
import { buildPaths, buildTrees, currencyName, type PathGroup, type TreeView } from './model';
import { PathsView } from './paths-view';
import type { SheetWrites } from './writes';

type View =
  { kind: 'paths'; id: string; group: PathGroup } | { kind: 'tree'; id: string; tree: TreeView };

export function useTreeData(ctx: ContexteFiche) {
  return useMemo(
    () => ({ paths: buildPaths(ctx.fiche), trees: buildTrees(ctx.fiche) }),
    [ctx.fiche],
  );
}

export function TreeExplorer({
  ctx,
  writes,
  initialView,
  className,
  treesOnly = false,
}: {
  ctx: ContexteFiche;
  writes: SheetWrites | undefined;
  /** Vue ouverte au départ (identifiant d'arbre ou `paths:<sorte>`). */
  initialView?: string;
  className?: string;
  /** Arbres seuls (les voies et les soldes sont montrés ailleurs, bloc Compétences). */
  treesOnly?: boolean;
}) {
  const data = useTreeData(ctx);
  const { trees } = data;
  const paths = treesOnly ? [] : data.paths;
  const views: View[] = useMemo(
    () => [
      ...paths.map((group) => ({ kind: 'paths' as const, id: `paths:${group.sorte.id}`, group })),
      ...trees
        .filter((t) => t.open || t.owned > 0)
        .map((tree) => ({ kind: 'tree' as const, id: tree.tree.id, tree })),
    ],
    [paths, trees],
  );
  const closed = useMemo(() => trees.filter((t) => !t.open && t.owned === 0), [trees]);

  const [selectedId, setSelectedId] = useState<string | null>(initialView ?? null);
  const [selection, setSelection] = useState<TreeSelection | null>(null);

  const preview = closed.find((t) => t.tree.id === selectedId);
  const current: View | undefined = preview
    ? { kind: 'tree', id: preview.tree.id, tree: preview }
    : (views.find((v) => v.id === selectedId) ?? views[0]);

  const cur = (id: string | undefined) => currencyName(ctx.systeme, id);
  const currencies = [
    ...new Set([
      ...paths.flatMap((g) => g.currencies),
      ...trees.flatMap((t) => t.currencies),
      ...trees.flatMap((t) => (t.openerOffer ? [t.openerOffer.monnaie] : [])),
    ]),
  ];

  if (!views.length && !closed.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
        <GitBranch className="size-6 text-subtle" />
        <p className="text-sm text-muted-foreground">
          Ce système ne déclare ni arbre ni voie pour ce personnage.
        </p>
      </div>
    );

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3', className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-0.5">
          {views.map((v) => {
            const on = current?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                className={cn(
                  'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                  on
                    ? 'bg-surface-3 text-foreground shadow-surface'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v.kind === 'paths' ? (
                  <Route className="size-3.5" />
                ) : (
                  <GitBranch className="size-3.5" />
                )}
                {v.kind === 'paths'
                  ? (v.group.sorte.nomPluriel ?? v.group.sorte.nom)
                  : v.tree.tree.nom}
                {v.kind === 'tree' && (
                  <span className="font-mono text-[11px] tabular text-subtle">{v.tree.owned}</span>
                )}
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
        {!treesOnly &&
          currencies.map((m) => (
            <span
              key={m}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 text-[12px]"
              title={cur(m)}
            >
              <Coins className="size-3.5 text-primary" />
              <span className="font-mono font-semibold tabular">{solde(ctx.fiche, m)}</span>
              <span className="hidden text-subtle sm:inline">{cur(m)}</span>
            </span>
          ))}
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
        {current?.kind === 'paths' && (
          <div className="h-full overflow-auto">
            <PathsView
              group={current.group}
              currencyName={cur}
              onSelect={(path, rank) => setSelection({ kind: 'rank', path, rank })}
            />
          </div>
        )}
        {current?.kind === 'tree' && (
          <GridTree
            key={current.id}
            view={current.tree}
            geometry={ctx.presentation?.arbres}
            currencyName={cur}
            onSelect={(node) => setSelection({ kind: 'node', tree: current.tree, node })}
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
