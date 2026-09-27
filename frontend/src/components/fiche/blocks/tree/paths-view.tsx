'use client';

/**
 * Voies : une carte par entrée à rangs possédée, ses rangs successifs et les entrées que
 * chacun accorde. Le rang suivant affiche son coût (ou son blocage) ; le détail s'ouvre au clic.
 */
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PathGroup, PathRankView, PathView } from './model';

export function PathsView({
  group,
  currencyName,
  onSelect,
}: {
  group: PathGroup;
  currencyName: (id: string | undefined) => string;
  onSelect: (path: PathView, rank: PathRankView) => void;
}) {
  if (!group.paths.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Rien à afficher pour l’instant ({group.sorte.nomPluriel ?? group.sorte.nom}).
      </p>
    );
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
      {group.paths.map((path) => (
        <article
          key={path.entry.id}
          className="flex flex-col rounded-xl border border-border bg-surface-2/40 p-3"
        >
          <header className="mb-2.5 flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-tight">{path.entry.nom}</h3>
            <span className="shrink-0 font-mono text-[11px] tabular text-muted-foreground">
              {path.rank}/{path.maxRank}
            </span>
          </header>
          <div className="mb-3 flex gap-1" aria-hidden>
            {path.ranks.map((r) => (
              <span
                key={r.rank}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  r.owned ? 'bg-primary' : r.offer?.possible ? 'bg-success/50' : 'bg-surface-3',
                )}
              />
            ))}
          </div>
          <ol className="space-y-1">
            {path.ranks.map((r) => {
              const next = !!r.offer;
              return (
                <li key={r.rank}>
                  <button
                    type="button"
                    onClick={() => onSelect(path, r)}
                    className={cn(
                      'group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-surface-3',
                      !r.owned && !next && 'opacity-60',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] tabular',
                        r.owned
                          ? 'border-primary bg-primary text-primary-foreground'
                          : next && r.offer?.possible
                            ? 'border-success/60 text-success'
                            : 'border-border-strong text-subtle',
                      )}
                    >
                      {r.owned ? <Check className="size-3" /> : r.rank}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[13px]',
                        r.owned ? 'font-medium text-primary-strong' : 'text-foreground/85',
                      )}
                    >
                      {r.entries.map((e) => e.nom).join(' · ') || `Rang ${r.rank}`}
                    </span>
                    {next && r.offer && (
                      <span
                        className={cn(
                          'shrink-0 font-mono text-[11px] tabular',
                          r.offer.possible ? 'text-success' : 'text-warning',
                        )}
                        title={currencyName(r.offer.monnaie)}
                      >
                        {r.offer.cout}
                      </span>
                    )}
                    {!r.owned && !next && <Lock className="size-3 shrink-0 text-subtle" />}
                  </button>
                </li>
              );
            })}
          </ol>
        </article>
      ))}
    </div>
  );
}
