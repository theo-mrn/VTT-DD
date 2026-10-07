import { useTranslations } from 'next-intl';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { challengePercent, formatXp, stepHref, type Challenge } from '@/lib/progression';
import { cn } from '@/lib/utils';

/** Défis avec leur progression ; `links` : chaque ligne mène à l'action qui la fait avancer. */
export function ChallengeList({
  challenges,
  links = false,
  compact = false,
}: Readonly<{ challenges: Challenge[]; links?: boolean; compact?: boolean }>) {
  return (
    <ul className={cn('space-y-2', compact && 'space-y-1.5')}>
      {challenges.map((c) => (
        <li key={c.id}>
          {links && !c.completed ? (
            <Link
              href={stepHref(c.id)}
              className="group block rounded-xl border border-border-strong bg-surface-2/60 transition-colors hover:border-primary/40"
            >
              <ChallengeRow challenge={c} compact={compact} link />
            </Link>
          ) : (
            <div
              className={cn(
                'rounded-xl border',
                c.completed ? 'border-border' : 'border-border-strong bg-surface-2/60',
              )}
            >
              <ChallengeRow challenge={c} compact={compact} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ChallengeRow({
  challenge: c,
  compact,
  link = false,
}: Readonly<{ challenge: Challenge; compact: boolean; link?: boolean }>) {
  const label = useChallengeLabel();
  return (
    <div className={cn('flex items-center gap-3 px-3', compact ? 'py-2' : 'py-2.5')}>
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          c.completed
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border-strong text-transparent',
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              'truncate text-[13px]',
              c.completed ? 'text-subtle line-through decoration-subtle/50' : 'text-foreground',
            )}
          >
            {label(c)}
          </p>
          {c.target > 1 && !c.completed && (
            <span className="shrink-0 text-[11px] tabular-nums text-subtle">
              {formatXp(c.progress)} / {formatXp(c.target)}
            </span>
          )}
        </div>
        {c.target > 1 && !c.completed && (
          <Progress valeur={challengePercent(c)} className="mt-1.5 h-1" label={label(c)} />
        )}
      </div>
      <span
        className={cn(
          'shrink-0 text-xs font-medium tabular-nums',
          c.completed ? 'text-subtle' : 'text-primary',
        )}
      >
        +{c.xp} XP
      </span>
      {link && (
        <ArrowRight className="size-3.5 shrink-0 text-subtle transition-colors group-hover:text-primary" />
      )}
    </div>
  );
}

/**
 * Libellé d'un défi dans la langue de la page, par son identifiant ; un défi que le front ne
 * connaît pas encore garde le libellé envoyé par identity.
 */
export function useChallengeLabel(): (c: Pick<Challenge, 'id' | 'label'>) => string {
  const t = useTranslations('progression.challenges');
  return (c) => (t.has(c.id as never) ? t(c.id as never) : c.label);
}
