'use client';

/**
 * Grille d'un arbre, reprise de la vue d'arbre de talents de l'ancienne fiche :
 * cases alignées sur la grille (géométrie de `presentation.arbres`), reliées
 * par des traits droits (bord à bord sur une même ligne ou colonne), états
 * acquis / achetable / trop cher / bloqué, dialogue d'achat au clic.
 */
import type { Arbre } from '@vtt/rules';
import { Check, Lock, Star, Undo2 } from 'lucide-react';
import { useId, useMemo, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { SheetBindings } from '../skills/common/bindings';
import { WriteButton } from '../skills/common/controls';
import { EntryDialog } from '../skills/common/entry-dialog';
import {
  blockKind,
  blockLabel,
  blockMessages,
  currencyName,
  journalLines,
  markName,
  marksOf,
  readableField,
  refundError,
} from '../skills/common/helpers';
import {
  accentButton,
  accentChip,
  focus,
  ghostButton,
  text,
  textAccent,
  textMuted,
} from '../skills/common/styles';
import { nodeViews, STATUS_LABELS, type NodeStatus, type NodeView, type TreeNode } from './helpers';

/** Géométrie par défaut, quand la présentation n'en déclare pas (px). */
const DEFAULT_GEOMETRY = { colonne: 200, ligne: 130, noeud: { largeur: 176, hauteur: 64 } };

export interface TreeGridProps extends Pick<
  SheetBindings,
  'system' | 'sheet' | 'purchases' | 'presentation' | 'themeVariables' | 'onBuy' | 'onRefund'
> {
  tree: Arbre;
  /** Achat et annulation depuis le dialogue d'un nœud (faux : aperçu, codex, lecture seule). */
  canBuy: boolean;
}

export function TreeGrid({
  tree,
  canBuy,
  system,
  sheet,
  purchases,
  presentation,
  themeVariables,
  onBuy,
  onRefund,
}: TreeGridProps) {
  const g = presentation.arbres ?? DEFAULT_GEOMETRY;
  const markerId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const views = useMemo(
    () => nodeViews(system, sheet, purchases, tree),
    [system, sheet, purchases, tree],
  );

  const minX = Math.min(...tree.noeuds.map((n) => n.x));
  const minY = Math.min(...tree.noeuds.map((n) => n.y));
  const pos = (n: TreeNode) => ({ x: (n.x - minX) * g.colonne, y: (n.y - minY) * g.ligne });
  const width = Math.max(...tree.noeuds.map((n) => pos(n).x)) + g.noeud.largeur;
  const height = Math.max(...tree.noeuds.map((n) => pos(n).y)) + g.noeud.hauteur;
  const byId = new Map(tree.noeuds.map((n) => [n.id, n]));
  const acquired = (id: string) => views.get(id)?.status === 'acquired';

  // Ancrage : bord à bord sur une même ligne ou colonne, pour ne jamais traverser le texte d'une case
  const segment = (a: TreeNode, b: TreeNode) => {
    const pa = pos(a);
    const pb = pos(b);
    const w = g.noeud.largeur;
    const h = g.noeud.hauteur;
    if (a.y === b.y) {
      const y = pa.y + h / 2;
      return pa.x < pb.x
        ? { x1: pa.x + w, y1: y, x2: pb.x, y2: y }
        : { x1: pa.x, y1: y, x2: pb.x + w, y2: y };
    }
    if (a.x === b.x) {
      const x = pa.x + w / 2;
      return pa.y < pb.y
        ? { x1: x, y1: pa.y + h, x2: x, y2: pb.y }
        : { x1: x, y1: pa.y, x2: x, y2: pb.y + h };
    }
    return { x1: pa.x + w / 2, y1: pa.y + h / 2, x2: pb.x + w / 2, y2: pb.y + h / 2 };
  };

  const current = selected ? views.get(selected) : undefined;

  return (
    <>
      <div className="overflow-x-auto p-4">
        <div className="relative mx-auto" style={{ width, height }}>
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0"
            width={width}
            height={height}
          >
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="var(--fiche-texte-secondaire)" />
              </marker>
            </defs>
            {tree.liens.map((l, i) => {
              const a = byId.get(l.de);
              const b = byId.get(l.vers);
              if (!a || !b) return null;
              const both = acquired(a.id) && acquired(b.id);
              const one = acquired(a.id) || acquired(b.id);
              return (
                <line
                  key={i}
                  {...segment(a, b)}
                  stroke={
                    both
                      ? 'var(--fiche-accent)'
                      : one
                        ? 'color-mix(in srgb, var(--fiche-accent) 45%, var(--fiche-bordure))'
                        : 'var(--fiche-bordure)'
                  }
                  strokeWidth={2}
                  strokeDasharray={l.sens === 'simple' ? '6 4' : undefined}
                  markerEnd={l.sens === 'simple' ? `url(#${markerId})` : undefined}
                />
              );
            })}
          </svg>
          {tree.noeuds.map((n) => {
            const v = views.get(n.id)!;
            const p = pos(n);
            return (
              <NodeBox
                key={n.id}
                view={v}
                rank={v.entry ? (sheet.possessions.get(v.entry.id)?.rang ?? 0) : 0}
                ranked={!!(v.entry && system.sortes.get(v.entry.sorte)?.rangs)}
                selected={selected === n.id}
                style={{ left: p.x, top: p.y, width: g.noeud.largeur, height: g.noeud.hauteur }}
                onClick={() => setSelected(n.id)}
              />
            );
          })}
        </div>
      </div>

      {current && (
        <NodeDialog
          view={current}
          tree={tree}
          canBuy={canBuy}
          system={system}
          sheet={sheet}
          themeVariables={themeVariables}
          onBuy={onBuy}
          onRefund={onRefund}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

const BOX: Record<NodeStatus, string> = {
  acquired:
    'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_14%,var(--fiche-carte))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--fiche-accent)_20%,transparent)]',
  available:
    'border-[color:color-mix(in_srgb,var(--fiche-accent)_55%,transparent)] bg-[color:var(--fiche-carte)] hover:border-[color:var(--fiche-accent)]',
  unaffordable:
    'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] hover:border-[color:var(--fiche-texte-secondaire)]',
  locked:
    'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] opacity-[0.55] hover:opacity-80',
};

function NodeBox({
  view,
  rank,
  ranked,
  selected,
  style,
  onClick,
}: {
  view: NodeView;
  rank: number;
  ranked: boolean;
  selected: boolean;
  style: CSSProperties;
  onClick(): void;
}) {
  const { status, entry, node, cost } = view;
  const name = entry?.nom ?? node.entree;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${name} : ${STATUS_LABELS[status].toLowerCase()}${
        status !== 'acquired' && cost !== undefined ? `, coût ${cost}` : ''
      }`}
      className={cn(
        'absolute flex flex-col items-center justify-center rounded-lg border px-2 text-center transition-colors',
        BOX[status],
        selected && 'ring-2 ring-[color:var(--fiche-accent)]',
        focus,
      )}
      style={style}
    >
      <span
        className={cn(
          'line-clamp-2 text-xs font-semibold leading-tight',
          status === 'acquired' ? textAccent : text,
        )}
      >
        {name}
      </span>
      <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px]">
        {status === 'acquired' ? (
          <>
            <Check className={cn(textAccent, 'h-3 w-3')} />
            {ranked && rank > 1 && <span className={textMuted}>rang {rank}</span>}
          </>
        ) : (
          <>
            {status === 'locked' && <Lock className={cn(textMuted, 'h-3 w-3')} />}
            {cost !== undefined && (
              <span className={status === 'unaffordable' ? 'text-red-300/80' : textMuted}>
                {cost}
              </span>
            )}
          </>
        )}
      </span>
    </button>
  );
}

function NodeDialog({
  view,
  tree,
  canBuy,
  system,
  sheet,
  themeVariables,
  onBuy,
  onRefund,
  onClose,
}: Pick<TreeGridProps, 'system' | 'sheet' | 'themeVariables' | 'onBuy' | 'onRefund'> & {
  view: NodeView;
  tree: Arbre;
  canBuy: boolean;
  onClose(): void;
}) {
  const { node, entry, status, item, cost } = view;
  const state = sheet.etat;
  const kind = entry ? system.sortes.get(entry.sorte) : undefined;
  const rank = entry ? (sheet.possessions.get(entry.id)?.rang ?? 0) : 0;
  const marks = entry ? marksOf(sheet, entry.id) : [];
  const fields =
    entry && kind
      ? kind.champs
          .map((c) => ({ c, v: readableField(sheet, entry, c) }))
          .filter(({ v }) => v !== '')
      : [];
  const currency = item ? currencyName(system, item.monnaie) : '';
  const block = item ? blockKind(item) : null;

  const lines = journalLines(state, `${tree.id}/${node.id}`);
  const last = lines.at(-1);
  const lastLine = last !== undefined ? state.journal[last] : undefined;
  const lastError = last !== undefined ? refundError(system, state, last) : null;

  return (
    <EntryDialog
      open
      onClose={onClose}
      title={entry?.nom ?? node.entree}
      description={tree.nom}
      themeVariables={themeVariables}
      badges={
        <>
          <span className={accentChip}>{STATUS_LABELS[status]}</span>
          {marks.map((m) => (
            <span key={m} className={accentChip}>
              <Star className="h-3 w-3" />
              {markName(m)}
            </span>
          ))}
        </>
      }
      footer={
        <>
          {status !== 'acquired' && cost !== undefined && (
            <p className={cn(textMuted, 'mr-auto text-sm')}>
              Coût :{' '}
              <strong className={text}>
                {cost} {currency}
              </strong>
            </p>
          )}
          {canBuy && lastLine && last !== undefined && (
            <WriteButton
              className={ghostButton}
              disabled={!!lastError}
              title={lastError ?? undefined}
              onClick={async () => {
                if (await onRefund(last)) onClose();
              }}
            >
              <Undo2 />
              Annuler l’achat (+{lastLine.cout} {currencyName(system, lastLine.monnaie)})
            </WriteButton>
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            Fermer
          </button>
          {canBuy && item && status !== 'acquired' && (
            <WriteButton
              className={accentButton}
              disabled={!item.possible}
              title={item.possible ? undefined : blockMessages(item).join(' ; ')}
              onClick={async () => {
                if (await onBuy(item.achat, item.objet)) onClose();
              }}
            >
              {item.possible ? (
                `Acheter (${item.cout} ${currency})`
              ) : (
                <>
                  <Lock />
                  {blockLabel(block)}
                </>
              )}
            </WriteButton>
          )}
        </>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed">
        {entry?.description ? (
          <p className="whitespace-pre-line">{entry.description}</p>
        ) : (
          <p className={textMuted}>Pas de description.</p>
        )}
        {kind?.rangs && rank > 0 && (
          <p>
            Rang actuel : <strong>{rank}</strong>
          </p>
        )}
        {fields.map(({ c, v }) => (
          <p key={c.id}>
            {c.nom} : <strong>{v}</strong>
          </p>
        ))}
        {item && !item.possible && status !== 'acquired' && (
          <ul className="space-y-0.5 text-xs text-red-300">
            {blockMessages(item).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </div>
    </EntryDialog>
  );
}
