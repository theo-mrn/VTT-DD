'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatXp, levelPercent, useProgression } from '@/lib/progression';
import { ChallengeList } from './challenge-list';
import { LevelRing } from './level';
import { rewardText } from './rewards';

/**
 * Résumé de la progression sur l'accueil : niveau, prochaines étapes du parcours
 * guidé et défis du jour (docs/progression.md § 8.3).
 */
export function ProgressionSummary() {
  const t = useTranslations();
  const { data: p, isLoading } = useProgression();

  if (isLoading) return <Skeleton className="mb-8 h-44 rounded-2xl" />;
  if (!p) return null;

  return (
    <section className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-surface">
      <div
        aria-hidden
        className="absolute -left-36 -top-40 size-96 bg-[radial-gradient(closest-side,hsl(var(--primary)/0.08),transparent)]"
      />
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_minmax(0,1fr)]">
        <Link
          href="/profil#progression"
          className="group flex items-center gap-4 lg:flex-col lg:items-start"
        >
          <LevelRing level={p.level} percent={levelPercent(p)} />
          <div className="min-w-0 flex-1 space-y-1.5 lg:w-full">
            <p className="flex items-center gap-1.5 font-semibold">
              {t('progression.level', { level: p.level })}
              <ArrowRight className="size-3.5 text-subtle transition-colors group-hover:text-primary" />
            </p>
            <Progress valeur={levelPercent(p)} label={t('progression.level', { level: p.level })} />
            <p className="text-xs tabular-nums text-subtle">
              {t('progression.toNext', { xp: formatXp(p.nextLevelXp - p.xp), level: p.level + 1 })}
            </p>
            {p.nextReward && (
              <p className="truncate text-xs text-muted-foreground">
                {t('progression.levelReward', {
                  level: p.nextReward.level,
                  reward: rewardText(p.nextReward),
                })}
              </p>
            )}
          </div>
        </Link>

        <div className="min-w-0 space-y-2">
          <p className="text-[13px] font-semibold">{t('progression.nextSteps')}</p>
          {p.steps.length > 0 ? (
            <ChallengeList challenges={p.steps} links compact />
          ) : (
            <p className="text-[13px] text-subtle">{t('progression.allDone')}</p>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <p className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
            {t('progression.dailyChallenges')}
            <span className="text-xs font-normal tabular-nums text-subtle">
              {t('progression.today', { xp: formatXp(p.todayXp) })}
            </span>
          </p>
          <ChallengeList challenges={p.challenges.daily} compact />
        </div>
      </div>
    </section>
  );
}
