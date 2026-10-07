import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** Pastille « Niv. 7 » (profil public, listes). */
export function LevelBadge({ level, className }: Readonly<{ level: number; className?: string }>) {
  const t = useTranslations();
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 text-xs font-semibold tabular-nums text-primary-strong',
        className,
      )}
      aria-label={t('progression.level', { level })}
    >
      {t('progression.levelShort', { level })}
    </span>
  );
}

const sizes = {
  md: { box: 'size-14', text: 'text-lg', stroke: 4 },
  lg: { box: 'size-20', text: 'text-2xl', stroke: 5 },
};

/** Anneau du niveau : le numéro au centre, la part du niveau en cours autour. */
export function LevelRing({
  level,
  percent,
  size = 'md',
  className,
}: Readonly<{ level: number; percent: number; size?: keyof typeof sizes; className?: string }>) {
  const s = sizes[size];
  const r = 50 - s.stroke * 2;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, percent)) / 100) * circumference;
  return (
    <div className={cn('relative shrink-0', s.box, className)} aria-hidden>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth={s.stroke * 2}
          className="stroke-surface-3"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth={s.stroke * 2}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="stroke-primary transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center font-display font-semibold tabular-nums text-foreground',
          s.text,
        )}
      >
        {level}
      </span>
    </div>
  );
}
