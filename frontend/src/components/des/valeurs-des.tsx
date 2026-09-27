import type { GroupeDes } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { etatDe, type EtatDe } from './de-visuel';

const TEINTES: Record<EtatDe, string> = {
  normal: 'border-border bg-surface-2 text-foreground',
  ecarte: 'border-border/60 bg-transparent text-subtle line-through decoration-1',
  critique: 'border-primary/40 bg-primary/10 text-primary-strong',
  fumble: 'border-destructive/40 bg-destructive/10 text-destructive',
  explose: 'border-arcane/40 bg-arcane/10 text-arcane',
};

/**
 * Valeurs des dés d'un jet, en simples chiffres (pas de silhouettes) : le dé
 * écarté est barré, le 20 et le 1 d'un d20 seul sont teintés, l'explosif aussi.
 */
export function ValeursDes({
  groupes,
  max = 12,
  className,
}: {
  groupes: GroupeDes[];
  /** Au-delà, les dés sont résumés (« +12 »). */
  max?: number;
  className?: string;
}) {
  const seulD20 =
    groupes.filter((g) => g.faces === 20).flatMap((g) => g.dice.filter((d) => d.kept)).length === 1;
  const tous = groupes.flatMap((g, i) =>
    g.dice.map((d, j) => ({ faces: g.faces, d, cle: `${i}-${j}` })),
  );
  if (!tous.length) return null;
  return (
    <ul className={cn('flex flex-wrap items-center gap-1', className)} aria-label="Dés">
      {tous.slice(0, max).map(({ faces, d, cle }) => {
        const etat = etatDe(faces, d, seulD20);
        return (
          <li
            key={cle}
            title={`d${faces}`}
            aria-label={`d${faces} : ${d.value}${etat === 'ecarte' ? ', écarté' : ''}`}
            className={cn(
              'inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1 font-mono text-xs font-semibold tabular',
              TEINTES[etat],
            )}
          >
            {d.value}
          </li>
        );
      })}
      {tous.length > max && <li className="text-[11px] text-subtle">+{tous.length - max}</li>}
    </ul>
  );
}
