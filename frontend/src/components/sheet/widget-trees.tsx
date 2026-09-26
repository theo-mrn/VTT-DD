'use client';

import {
  arbreOuvert,
  chemins,
  essayer,
  type Arbre,
  type ObjetAchetable,
  type Widget,
} from '@vtt/rules';
import { Check, Lock, Undo2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { PurchaseButton } from './purchase-button';
import { useSheet } from './context';
import { Block, SheetEmpty } from './elements';
import { lastLine } from './possessions';
import { secondaryButton, focus, text, textAccent, textMuted } from './styles';

type TreesWidget = Extract<Widget, { type: 'arbres' }>;
type TreeNode = Arbre['noeuds'][number];
type Status = 'acquis' | 'achetable' | 'bloque';

/** Géométrie par défaut de la grille, quand la présentation n'en déclare pas (px). */
const GEOMETRY = { colonne: 190, ligne: 110, noeud: { largeur: 170, hauteur: 60 } };

export function TreesWidget({ widget }: { widget: TreesWidget }) {
  const { system, sheet } = useSheet();
  const opened = useMemo(
    () =>
      [...system.arbres.values()].filter(
        (a) =>
          arbreOuvert(sheet, a) &&
          a.noeuds.some((n) => {
            const e = system.entrees.get(n.entree);
            return !!e && !!system.sortes.get(e.sorte)?.pour.includes(sheet.etat.type);
          }),
      ),
    [system, sheet],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const active = opened.find((a) => a.id === selected) ?? opened[0];
  const tabIds = useId();

  return (
    <Block title={widget.titre}>
      {!active ? (
        <SheetEmpty>Aucun arbre ouvert pour l&apos;instant.</SheetEmpty>
      ) : (
        <>
          {opened.length > 1 && (
            <div
              role="tablist"
              aria-label={widget.titre}
              className="mb-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]"
            >
              {opened.map((a) => (
                <button
                  key={a.id}
                  id={`${tabIds}-${a.id}`}
                  type="button"
                  role="tab"
                  aria-selected={a.id === active.id}
                  aria-controls={`${tabIds}-panneau`}
                  onClick={() => setSelected(a.id)}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors',
                    a.id === active.id
                      ? 'bg-[color:color-mix(in_srgb,var(--fiche-accent)_16%,transparent)] text-[color:var(--fiche-accent)]'
                      : 'text-[color:var(--fiche-texte-secondaire)] hover:text-[color:var(--fiche-texte)]',
                    focus,
                  )}
                >
                  {a.nom}
                </button>
              ))}
            </div>
          )}
          <div
            id={`${tabIds}-panneau`}
            role={opened.length > 1 ? 'tabpanel' : undefined}
            aria-labelledby={opened.length > 1 ? `${tabIds}-${active.id}` : undefined}
          >
            <TreeGrid key={active.id} tree={active} withName={opened.length === 1} />
          </div>
        </>
      )}
    </Block>
  );
}

function TreeGrid({ tree, withName }: { tree: Arbre; withName: boolean }) {
  const { system, sheet, state, presentation, purchases, readOnly, buy, refund } = useSheet();
  const g = presentation.arbres ?? GEOMETRY;
  const [selection, setSelection] = useState<string | null>(null);
  const acquired = new Set(state.noeuds[tree.id] ?? []);

  const items = new Map<string, ObjetAchetable>();
  for (const a of purchases)
    for (const o of a.objets)
      if (o.type === 'noeud' && o.arbre === tree.id && o.noeud) items.set(o.noeud, o);

  const status = (n: TreeNode): Status =>
    acquired.has(n.id) ? 'acquis' : items.get(n.id)?.possible ? 'achetable' : 'bloque';

  const cost = (n: TreeNode) => {
    const o = items.get(n.id);
    if (o) return o.cout;
    const f = system.formules.get(chemins.noeud(tree.id, n.id));
    if (!f) return undefined;
    const r = essayer(sheet, f, {
      variable: (name) => (name === 'x' ? n.x : name === 'y' ? n.y : 0),
    });
    return r.ok ? Number(r.valeur) : undefined;
  };

  const minX = Math.min(...tree.noeuds.map((n) => n.x));
  const minY = Math.min(...tree.noeuds.map((n) => n.y));
  const pos = (n: TreeNode) => ({ x: (n.x - minX) * g.colonne, y: (n.y - minY) * g.ligne });
  const width = Math.max(...tree.noeuds.map((n) => pos(n).x)) + g.noeud.largeur;
  const height = Math.max(...tree.noeuds.map((n) => pos(n).y)) + g.noeud.hauteur;
  const byId = new Map(tree.noeuds.map((n) => [n.id, n]));
  const node = selection ? byId.get(selection) : undefined;
  const nodeEntry = node ? system.entrees.get(node.entree) : undefined;
  const nodeItem = node ? items.get(node.id) : undefined;
  const logLine = node ? lastLine(state, `${tree.id}/${node.id}`) : -1;
  const currency = nodeItem ? (system.monnaies.get(nodeItem.monnaie)?.nom ?? nodeItem.monnaie) : '';

  return (
    <div className="space-y-3">
      {withName && <h3 className={cn(text, 'text-sm font-semibold')}>{tree.nom}</h3>}
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
              const activeLink = acquired.has(a.id) && acquired.has(b.id);
              return (
                <line
                  key={i}
                  x1={pa.x + g.noeud.largeur / 2}
                  y1={pa.y + g.noeud.hauteur / 2}
                  x2={pb.x + g.noeud.largeur / 2}
                  y2={pb.y + g.noeud.hauteur / 2}
                  stroke={activeLink ? 'var(--fiche-accent)' : 'var(--fiche-bordure)'}
                  strokeWidth={activeLink ? 4 : 3}
                  strokeDasharray={l.sens === 'simple' ? '6 4' : undefined}
                />
              );
            })}
          </svg>
          {tree.noeuds.map((n) => {
            const e = system.entrees.get(n.entree);
            const s = status(n);
            const p = pos(n);
            const c = cost(n);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelection(n.id)}
                aria-pressed={selection === n.id}
                aria-label={`${e?.nom ?? n.entree} : ${s === 'acquis' ? 'acquis' : s === 'achetable' ? `achetable${c !== undefined ? ` pour ${c}` : ''}` : 'bloqué'}`}
                className={cn(
                  'absolute flex flex-col justify-center rounded-lg border px-2 py-1 text-left transition-colors',
                  s === 'acquis' &&
                    'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_22%,var(--fiche-carte))]',
                  s === 'achetable' &&
                    'border-[color:color-mix(in_srgb,var(--fiche-accent)_55%,transparent)] bg-[color:var(--fiche-carte)] hover:border-[color:var(--fiche-accent)]',
                  s === 'bloque' &&
                    'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] opacity-60',
                  selection === n.id && 'ring-2 ring-[color:var(--fiche-accent)]',
                  focus,
                )}
                style={{ left: p.x, top: p.y, width: g.noeud.largeur, height: g.noeud.hauteur }}
              >
                <span className={cn(text, 'line-clamp-2 text-xs font-medium leading-tight')}>
                  {e?.nom ?? n.entree}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px]">
                  {s === 'acquis' ? (
                    <Check className={cn(textAccent, 'h-3 w-3')} />
                  ) : s === 'bloque' ? (
                    <Lock className={cn(textMuted, 'h-3 w-3')} />
                  ) : null}
                  {c !== undefined && s !== 'acquis' && (
                    <span className={cn(textMuted, 'tabular-nums')}>{c}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {node && (
        <div
          aria-live="polite"
          className="space-y-2 rounded-xl border border-[color:var(--fiche-bordure)] p-3"
        >
          <p className={cn(text, 'text-sm font-semibold')}>{nodeEntry?.nom ?? node.entree}</p>
          {nodeEntry?.description && (
            <p className={cn(textMuted, 'whitespace-pre-line text-sm')}>{nodeEntry.description}</p>
          )}
          {status(node) === 'bloque' && nodeItem && (
            <p className="text-xs text-red-300">
              {nodeItem.blocages.map((b) => b.message).join(' ; ')}
            </p>
          )}
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              {nodeItem && !acquired.has(node.id) && (
                <PurchaseButton
                  item={nodeItem}
                  label={`Acheter ${nodeEntry?.nom ?? node.entree}`}
                  currency={currency}
                  buttonText={`Acheter · ${nodeItem.cout} ${currency}`}
                  onBuy={() => buy(nodeItem.achat, nodeItem.objet)}
                />
              )}
              {acquired.has(node.id) && logLine >= 0 && (
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => void refund(logLine)}
                >
                  <Undo2 />
                  Annuler l&apos;achat
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
