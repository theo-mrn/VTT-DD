import { cn } from '@/lib/utils';

/** Barre de progression (0 à 100). `ton` colore la partie remplie. */
function Progress({
  valeur,
  ton = 'primaire',
  className,
  label,
}: {
  valeur: number;
  ton?: 'primaire' | 'succes' | 'danger' | 'alerte' | 'info';
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, valeur));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500 ease-out',
          ton === 'primaire' && 'bg-gradient-to-r from-primary/80 to-primary-strong',
          ton === 'succes' && 'bg-success',
          ton === 'danger' && 'bg-destructive',
          ton === 'alerte' && 'bg-warning',
          ton === 'info' && 'bg-info',
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export { Progress };
