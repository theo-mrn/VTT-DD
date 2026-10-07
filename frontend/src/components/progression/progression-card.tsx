'use client';

import { useTranslations } from 'next-intl';
import { Clock, Info as InfoIcon } from 'lucide-react';
import { Carte, Chargement, Message } from '@/components/compte/elements';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import {
  formatXp,
  levelPercent,
  timeLeft,
  useProgression,
  type Challenge,
  type Progression,
} from '@/lib/progression';
import { ChallengeList } from './challenge-list';
import { LevelRing } from './level';
import { RewardTrack, rewardText } from './rewards';

/** Niveau, paliers et défis, sans cadre : carte du profil, panneau de la table. */
export function ProgressionContent() {
  const progression = useProgression();
  return (
    <>
      {progression.isLoading && <Chargement />}
      {progression.isError && <Message>{messageErreur(progression.error)}</Message>}
      {progression.data && <ProgressionBody p={progression.data} />}
    </>
  );
}

/** Carte « Progression » du profil : niveau, paliers et défis. */
export function ProgressionCard() {
  const t = useTranslations();

  return (
    <Carte
      titre={t('progression.title')}
      className="lg:col-span-2"
      action={
        <Info texte={t('progression.rules')} cote="left">
          <button
            type="button"
            aria-label={t('progression.howToEarn')}
            className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-3 hover:text-foreground"
          >
            <InfoIcon className="size-4" />
          </button>
        </Info>
      }
    >
      <ProgressionContent />
    </Carte>
  );
}

function ProgressionBody({ p }: Readonly<{ p: Progression }>) {
  const t = useTranslations();
  const first = p.challenges.permanent.filter((c) => c.group === 'first_steps');
  const milestones = p.challenges.permanent.filter((c) => c.group === 'milestone');
  const done = (list: Challenge[]) => list.filter((c) => c.completed).length;

  return (
    <div id="progression" className="space-y-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <LevelRing level={p.level} percent={levelPercent(p)} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-lg font-semibold">{t('progression.level', { level: p.level })}</p>
            <p className="text-[13px] tabular-nums text-muted-foreground">
              {formatXp(p.xp - p.levelXp)} / {formatXp(p.nextLevelXp - p.levelXp)} XP
            </p>
          </div>
          <Progress
            valeur={levelPercent(p)}
            label={t('progression.level', { level: p.level })}
            className="h-2"
          />
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-subtle">
            <span className="tabular-nums">
              {t('progression.today', { xp: formatXp(p.todayXp) })}
            </span>
            {p.nextReward && (
              <span>
                {t('progression.levelReward', {
                  level: p.nextReward.level,
                  reward: rewardText(p.nextReward),
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      <RewardTrack rewards={p.rewards} />

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">
            {t('progression.daily', {
              done: done(p.challenges.daily),
              total: p.challenges.daily.length,
            })}
          </TabsTrigger>
          <TabsTrigger value="weekly">
            {t('progression.weekly', {
              done: done(p.challenges.weekly),
              total: p.challenges.weekly.length,
            })}
          </TabsTrigger>
          <TabsTrigger value="permanent">
            {t('progression.permanent', {
              done: done(p.challenges.permanent),
              total: p.challenges.permanent.length,
            })}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4 space-y-3">
          <Renewal until={p.periods.dailyEndsAt} />
          <ChallengeList challenges={p.challenges.daily} />
        </TabsContent>
        <TabsContent value="weekly" className="mt-4 space-y-3">
          <Renewal until={p.periods.weeklyEndsAt} />
          <ChallengeList challenges={p.challenges.weekly} />
        </TabsContent>
        <TabsContent value="permanent" className="mt-4 space-y-5">
          <Group title={t('progression.firstSteps')} challenges={first} links />
          <Group title={t('progression.milestones')} challenges={milestones} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Renewal({ until }: Readonly<{ until: string }>) {
  const t = useTranslations();
  return (
    <p className="flex items-center gap-1.5 text-xs text-subtle">
      <Clock className="size-3.5" />
      {t('progression.renewal', { time: timeLeft(until) })}
    </p>
  );
}

function Group({
  title,
  challenges,
  links = false,
}: Readonly<{ title: string; challenges: Challenge[]; links?: boolean }>) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-subtle">{title}</p>
      <ChallengeList challenges={challenges} links={links} />
    </div>
  );
}
