'use client';

/**
 * Voies en tableau : une ligne par voie possédée (nom, provenance, rang atteint), une colonne
 * par rang, le nom court des entrées accordées dans chaque case. États par la couleur ET par
 * la forme : acquise (fond d'accent, coche), achetable (bordure d'accent pleine, « + », coût
 * au survol ou au focus), prochain rang bloqué (bordure en tirets), verrouillée (atténuée,
 * cadenas). Grille ARIA : flèches, Début, Fin, Entrée pour le détail.
 *
 * En largeur étroite, le tableau devient une liste de voies dépliables.
 */
import { Check, ChevronDown, Lock, Plus } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import type { PathRankView } from '../tree/model';
import type { PathRow } from './abilities';

type CellState = 'owned' | 'available' | 'blocked' | 'locked' | 'empty';

function cellState(rank: PathRankView | undefined): CellState {
  if (!rank) return 'empty';
  if (rank.owned) return 'owned';
  if (rank.offer?.possible) return 'available';
  if (rank.offer) return 'blocked';
  return 'locked';
}

const STATE_LABEL: Record<CellState, string> = {
  owned: 'acquise',
  available: 'achetable',
  blocked: 'prochain rang, bloqué',
  locked: 'verrouillée',
  empty: 'aucune',
};

const CELL_CLASS: Record<CellState, string> = {
  owned: 'border-primary/45 bg-primary/[0.14] text-primary-strong hover:bg-primary/20',
  available:
    'border-primary bg-primary/[0.04] text-foreground ring-1 ring-inset ring-primary/35 hover:bg-primary/10',
  blocked: 'border-dashed border-border-strong text-muted-foreground hover:bg-surface-3',
  locked:
    'border-transparent bg-surface-2/50 text-subtle hover:bg-surface-2 hover:text-muted-foreground',
  empty: 'border-transparent text-subtle',
};

function rankTitle(rank: PathRankView | undefined): string {
  return rank?.entries.map((e) => e.nom).join(' · ') || (rank ? `Rang ${rank.rank}` : '—');
}

function costText(rank: PathRankView, currencyName: (id: string) => string): string | null {
  const o = rank.offer;
  if (!o) return null;
  return o.possible
    ? `${o.cout} ${currencyName(o.monnaie)}`
    : o.blocages.map((b) => b.message).join(' · ') || `${o.cout} ${currencyName(o.monnaie)}`;
}

function StateGlyph({ state }: Readonly<{ state: CellState }>) {
  if (state === 'owned') return <Check className="size-3 shrink-0" aria-hidden />;
  if (state === 'available') return <Plus className="size-3 shrink-0 text-primary" aria-hidden />;
  if (state === 'locked') return <Lock className="size-2.5 shrink-0 opacity-70" aria-hidden />;
  return null;
}

/** Contenu d'une case : glyphe d'état, nom court, coût révélé au survol ou au focus. */
function CellBody({
  rank,
  state,
  currencyName,
}: Readonly<{
  rank: PathRankView | undefined;
  state: CellState;
  currencyName: (id: string) => string;
}>) {
  const cost = rank?.offer ? rank.offer.cout : undefined;
  return (
    <>
      <span className="flex min-w-0 items-start gap-1">
        <span className="mt-[3px]">
          <StateGlyph state={state} />
        </span>
        <span className="line-clamp-2 min-w-0 break-words">{rankTitle(rank)}</span>
      </span>
      {cost !== undefined && (
        <span
          className={cn(
            'pointer-events-none absolute -top-2 right-1 rounded-full border px-1.5 font-mono text-[10px] leading-4 tabular',
            'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none',
            state === 'available'
              ? 'border-primary/60 bg-card text-primary-strong'
              : 'border-warning/40 bg-card text-warning',
          )}
          aria-hidden
        >
          {cost} {currencyName(rank!.offer!.monnaie)}
        </span>
      )}
    </>
  );
}

function cellLabel(
  path: PathRow,
  rank: PathRankView | undefined,
  state: CellState,
  currencyName: (id: string) => string,
): string {
  const cost = rank ? costText(rank, currencyName) : null;
  return [
    `${path.entry.nom}, rang ${rank?.rank ?? '?'} : ${rankTitle(rank)}`,
    STATE_LABEL[state],
    cost,
  ]
    .filter(Boolean)
    .join(', ');
}

export function PathsTable({
  paths,
  columns,
  caption,
  narrow,
  currencyName,
  onSelect,
}: Readonly<{
  paths: PathRow[];
  columns: number;
  caption: string;
  /** Largeur étroite : liste de voies dépliables à la place du tableau. */
  narrow: boolean;
  currencyName: (id: string) => string;
  onSelect: (path: PathRow, rank: PathRankView) => void;
}>) {
  if (!paths.length)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">Aucune voie pour l’instant.</p>
    );
  return narrow ? (
    <PathsList paths={paths} currencyName={currencyName} onSelect={onSelect} />
  ) : (
    <PathsGrid
      paths={paths}
      columns={columns}
      caption={caption}
      currencyName={currencyName}
      onSelect={onSelect}
    />
  );
}

function PathsGrid({
  paths,
  columns,
  caption,
  currencyName,
  onSelect,
}: Readonly<{
  paths: PathRow[];
  columns: number;
  caption: string;
  currencyName: (id: string) => string;
  onSelect: (path: PathRow, rank: PathRankView) => void;
}>) {
  const ranks = Array.from({ length: columns }, (_, i) => i + 1);
  // Focus itinérant : une seule case atteignable par Tab, les flèches déplacent le focus
  const [focus, setFocus] = useState<[number, number]>(() => {
    const r = paths.findIndex((p) => p.ranks.some((x) => x.offer?.possible));
    const row = Math.max(0, r);
    return [row, Math.min(columns - 1, paths[row]!.rank)];
  });
  const table = useRef<HTMLTableElement>(null);
  const [fr, fc] = [Math.min(focus[0], paths.length - 1), Math.min(focus[1], columns - 1)];

  const move = (row: number, col: number) => {
    const r = Math.max(0, Math.min(paths.length - 1, row));
    const c = Math.max(0, Math.min(columns - 1, col));
    setFocus([r, c]);
    table.current?.querySelector<HTMLButtonElement>(`[data-cell="${r}:${c}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent, row: number, col: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [row, col + 1],
      ArrowLeft: [row, col - 1],
      ArrowDown: [row + 1, col],
      ArrowUp: [row - 1, col],
      Home: e.ctrlKey ? [0, 0] : [row, 0],
      End: e.ctrlKey ? [paths.length - 1, columns - 1] : [row, columns - 1],
    };
    const to = moves[e.key];
    if (!to) return;
    e.preventDefault();
    move(to[0], to[1]);
  };

  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <table
        ref={table}
        role="grid"
        aria-label={caption}
        className="w-full min-w-[34rem] table-fixed border-separate [border-spacing:4px]"
      >
        <colgroup>
          <col className="w-[27%]" />
          {ranks.map((r) => (
            <col key={r} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="px-1 text-left text-[11px] font-medium text-subtle">
              <span className="sr-only">Voie</span>
            </th>
            {ranks.map((r) => (
              <th
                key={r}
                scope="col"
                className="px-1 text-left text-[11px] font-medium uppercase tracking-wider text-subtle"
              >
                Rang {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paths.map((path, row) => (
            <tr key={path.entry.id}>
              <th scope="row" className="px-1 py-0 text-left align-middle font-normal">
                <span
                  className="block truncate text-[13px] font-semibold text-foreground"
                  title={path.entry.nom}
                >
                  {path.entry.nom}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-subtle">
                  {path.source && <span className="truncate">{path.source}</span>}
                  <span
                    className="font-mono tabular"
                    aria-label={`rang ${path.rank} sur ${path.maxRank}`}
                  >
                    {path.rank}/{path.maxRank}
                  </span>
                </span>
              </th>
              {ranks.map((r, col) => {
                const rank = path.ranks.find((x) => x.rank === r);
                const state = cellState(rank);
                return (
                  <td key={r} role="gridcell" className="p-0 align-top">
                    {rank ? (
                      <button
                        type="button"
                        data-cell={`${row}:${col}`}
                        tabIndex={row === fr && col === fc ? 0 : -1}
                        onClick={() => {
                          setFocus([row, col]);
                          onSelect(path, rank);
                        }}
                        onKeyDown={(e) => onKey(e, row, col)}
                        aria-label={cellLabel(path, rank, state, currencyName)}
                        className={cn(
                          'group relative flex min-h-11 w-full items-center rounded-lg border px-2 py-1.5 text-left text-[12px] leading-tight',
                          'transition-colors duration-150 motion-reduce:transition-none',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          state === 'owned' && 'font-medium',
                          CELL_CLASS[state],
                        )}
                      >
                        <CellBody rank={rank} state={state} currencyName={currencyName} />
                      </button>
                    ) : (
                      <span
                        data-cell={`${row}:${col}`}
                        tabIndex={row === fr && col === fc ? 0 : -1}
                        onKeyDown={(e) => onKey(e, row, col)}
                        className="flex min-h-11 items-center justify-center rounded-lg text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`${path.entry.nom}, rang ${r} : aucun`}
                      >
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Largeur étroite : une voie par section dépliable, ses rangs en liste. */
function PathsList({
  paths,
  currencyName,
  onSelect,
}: Readonly<{
  paths: PathRow[];
  currencyName: (id: string) => string;
  onSelect: (path: PathRow, rank: PathRankView) => void;
}>) {
  const [open, setOpen] = useState<Set<string>>(() => {
    const first = paths.find((p) => p.ranks.some((r) => r.offer?.possible)) ?? paths[0];
    return new Set(first ? [first.entry.id] : []);
  });
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <ul className="space-y-1.5">
      {paths.map((path) => {
        const expanded = open.has(path.entry.id);
        const panel = `path-${path.entry.id}`;
        const buyable = path.ranks.some((r) => r.offer?.possible);
        return (
          <li key={path.entry.id} className="rounded-xl border border-border bg-surface-2/40">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panel}
              onClick={() => toggle(path.entry.id)}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{path.entry.nom}</span>
                {path.source && (
                  <span className="block truncate text-[11px] text-subtle">{path.source}</span>
                )}
              </span>
              <span className="flex items-center gap-0.5" aria-hidden>
                {path.ranks.map((r) => (
                  <span
                    key={r.rank}
                    className={cn(
                      'h-1.5 w-2.5 rounded-full',
                      r.owned
                        ? 'bg-primary'
                        : r.offer?.possible
                          ? 'border border-primary'
                          : 'bg-surface-3',
                    )}
                  />
                ))}
              </span>
              <span className="font-mono text-[11px] tabular text-muted-foreground">
                {path.rank}/{path.maxRank}
                {buyable && <span className="sr-only">, un rang achetable</span>}
              </span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-subtle transition-transform duration-150 motion-reduce:transition-none',
                  expanded && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
            {expanded && (
              <ol id={panel} className="space-y-1 px-2 pb-2">
                {path.ranks.map((rank) => {
                  const state = cellState(rank);
                  return (
                    <li key={rank.rank}>
                      <button
                        type="button"
                        onClick={() => onSelect(path, rank)}
                        aria-label={cellLabel(path, rank, state, currencyName)}
                        className={cn(
                          'group relative flex min-h-11 w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[13px]',
                          'transition-colors duration-150 motion-reduce:transition-none',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          CELL_CLASS[state],
                        )}
                      >
                        <span className="w-4 shrink-0 font-mono text-[11px] tabular opacity-70">
                          {rank.rank}
                        </span>
                        <StateGlyph state={state} />
                        <span className="min-w-0 flex-1 truncate">{rankTitle(rank)}</span>
                        {rank.offer && (
                          <span
                            className={cn(
                              'shrink-0 font-mono text-[11px] tabular',
                              rank.offer.possible ? 'text-primary-strong' : 'text-warning',
                            )}
                          >
                            {rank.offer.cout}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}
