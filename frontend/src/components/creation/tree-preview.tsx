'use client';

/**
 * Aperçu en lecture seule d'un arbre (spécialisation…) : la grille complète et
 * ses liens, pour choisir l'entrée qui l'ouvre en connaissance de cause. Le
 * détail d'un nœud s'affiche au clic.
 */
import { chemins, essayer, type Arbre } from '@vtt/rules';
import { Eye } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from '../sheet/context';
import { SheetDialog } from '../sheet/elements';
import { focus, iconButton, text, textMuted } from '../sheet/styles';
import { RichText } from './ui';

type TreeNode = Arbre['noeuds'][number];

/** Géométrie par défaut, quand la présentation n'en déclare pas (px). */
const GEOMETRY = { colonne: 190, ligne: 110, noeud: { largeur: 170, hauteur: 60 } };

export function TreePreview({ tree }: { tree: Arbre }) {
  const { system, sheet, presentation } = useSheet();
  const g = presentation.arbres ?? GEOMETRY;
  const [selected, setSelected] = useState<string | null>(null);
  if (!tree.noeuds.length) return null;

  const minX = Math.min(...tree.noeuds.map((n) => n.x));
  const minY = Math.min(...tree.noeuds.map((n) => n.y));
  const pos = (n: TreeNode) => ({ x: (n.x - minX) * g.colonne, y: (n.y - minY) * g.ligne });
  const width = Math.max(...tree.noeuds.map((n) => pos(n).x)) + g.noeud.largeur;
  const height = Math.max(...tree.noeuds.map((n) => pos(n).y)) + g.noeud.hauteur;
  const byId = new Map(tree.noeuds.map((n) => [n.id, n]));
  const cost = (n: TreeNode) => {
    const f = system.formules.get(chemins.noeud(tree.id, n.id));
    if (!f) return undefined;
    const r = essayer(sheet, f, {
      variable: (name) => (name === 'x' ? n.x : name === 'y' ? n.y : 0),
    });
    return r.ok ? Number(r.valeur) : undefined;
  };
  const node = selected ? byId.get(selected) : undefined;
  const nodeEntry = node ? system.entrees.get(node.entree) : undefined;

  return (
    <div className="space-y-3">
      {tree.description && <p className={cn(textMuted, 'text-xs')}>{tree.description}</p>}
      <div className="overflow-x-auto rounded-xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] p-3">
        <div className="relative" style={{ width, height }}>
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0"
            width={width}
            height={height}
          >
            {tree.liens.map((l, i) => {
              const a = byId.get(l.de);
              const b = byId.get(l.vers);
              if (!a || !b) return null;
              const pa = pos(a);
              const pb = pos(b);
              return (
                <line
                  key={i}
                  x1={pa.x + g.noeud.largeur / 2}
                  y1={pa.y + g.noeud.hauteur / 2}
                  x2={pb.x + g.noeud.largeur / 2}
                  y2={pb.y + g.noeud.hauteur / 2}
                  stroke="var(--fiche-bordure)"
                  strokeWidth={3}
                  strokeDasharray={l.sens === 'simple' ? '6 4' : undefined}
                />
              );
            })}
          </svg>
          {tree.noeuds.map((n) => {
            const e = system.entrees.get(n.entree);
            const p = pos(n);
            const c = cost(n);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelected(n.id)}
                aria-pressed={selected === n.id}
                className={cn(
                  'absolute flex flex-col justify-center rounded-lg border px-2 py-1 text-left transition-colors',
                  n.depart
                    ? 'border-[color:color-mix(in_srgb,var(--fiche-accent)_55%,transparent)]'
                    : 'border-[color:var(--fiche-bordure)]',
                  'bg-[color:var(--fiche-carte)] hover:border-[color:var(--fiche-accent)]',
                  selected === n.id && 'ring-2 ring-[color:var(--fiche-accent)]',
                  focus,
                )}
                style={{ left: p.x, top: p.y, width: g.noeud.largeur, height: g.noeud.hauteur }}
              >
                <span className={cn(text, 'line-clamp-2 text-xs font-medium leading-tight')}>
                  {e?.nom ?? n.entree}
                </span>
                {c !== undefined && (
                  <span className={cn(textMuted, 'mt-0.5 text-[11px] tabular-nums')}>{c}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {node && (
        <div
          aria-live="polite"
          className="space-y-1 rounded-xl border border-[color:var(--fiche-bordure)] p-3"
        >
          <p className={cn(text, 'text-sm font-semibold')}>{nodeEntry?.nom ?? node.entree}</p>
          {nodeEntry?.description && (
            <RichText source={nodeEntry.description} className={cn(textMuted, 'text-sm')} />
          )}
        </div>
      )}
    </div>
  );
}

/** Bouton « œil » qui ouvre l'aperçu des arbres d'une entrée, sans la sélectionner. */
export function TreePreviewButton({
  trees,
  label,
  className,
}: {
  trees: Arbre[];
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!trees.length) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`Voir l’arbre : ${label}`}
        aria-label={`Voir l’arbre : ${label}`}
        className={cn(iconButton, 'h-8 w-8', className)}
      >
        <Eye className="h-4 w-4" />
      </button>
      <SheetDialog
        open={open}
        onClose={() => setOpen(false)}
        title={trees.length === 1 ? trees[0]!.nom : label}
        large
      >
        <div className="space-y-6">
          {trees.map((t) => (
            <div key={t.id} className="space-y-2">
              {trees.length > 1 && <h3 className={cn(text, 'text-sm font-semibold')}>{t.nom}</h3>}
              <TreePreview tree={t} />
            </div>
          ))}
        </div>
      </SheetDialog>
    </>
  );
}
