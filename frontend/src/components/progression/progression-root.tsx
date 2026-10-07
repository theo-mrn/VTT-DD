'use client';

/**
 * Progression du compte à l'échelle de l'app (docs/progression.md § 8) : sur
 * toutes les pages connectées, notifications sobres au passage de niveau et à
 * un défi accompli (événements personnels du temps réel), et envoi du temps de
 * jeu par lots (§ 8.4).
 */
import { useChallengeLabel } from './challenge-list';
import { translate } from '@/i18n/runtime';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  addPlayTime,
  PlayTimeCounter,
  progressionKeys,
  type LevelReward,
  type Progression,
} from '@/lib/progression';
import { useCampaignEvents, type RealtimeEvent } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { rewardText } from './rewards';

const EVENTS = ['identity.level_reached', 'identity.challenge_completed'] as const;

interface LevelReached {
  level: number;
  rewards?: Pick<LevelReward, 'type' | 'id' | 'level'>[];
}

interface ChallengeCompleted {
  challengeId: string;
  xp: number;
}

export function ProgressionRoot() {
  const { profil } = useSession();
  const connected = Boolean(profil);
  useProgressionNotifications(connected);
  usePlayTime(connected);
  return null;
}

function useProgressionNotifications(enabled: boolean) {
  const client = useQueryClient();
  const t = useTranslations();
  const challengeLabel = useChallengeLabel();

  useCampaignEvents<Record<string, unknown>>(
    null,
    EVENTS,
    (e: RealtimeEvent) => {
      // Libellés tirés de la progression déjà lue (avant sa relecture)
      const known = client.getQueryData<Progression>(progressionKeys.root);
      if (e.event.type === 'identity.level_reached') {
        const p = e.event.payload as unknown as LevelReached;
        const rewards = (p.rewards ?? []).map((r) =>
          rewardText({
            ...r,
            label: known?.rewards.find((k) => k.id === r.id)?.label ?? null,
          }),
        );
        toast(
          t('progression.level', { level: p.level }),
          rewards.length ? { description: rewards.join(' · ') } : {},
        );
      } else {
        const p = e.event.payload as unknown as ChallengeCompleted;
        const all = known
          ? [...known.challenges.daily, ...known.challenges.weekly, ...known.challenges.permanent]
          : [];
        const found = all.find((c) => c.id === p.challengeId);
        const label = found ? challengeLabel(found) : null;
        toast(t('progression.challengeDone'), {
          description: `${label ? `${label} · ` : ''}+${p.xp} XP`,
        });
      }
      void client.invalidateQueries({ queryKey: progressionKeys.root });
    },
    { enabled },
  );
}

const MINUTE = 60_000;

/** Une minute comptée par minute d'onglet visible, envoyée par lots. */
function usePlayTime(enabled: boolean) {
  const counter = useRef(new PlayTimeCounter());

  useEffect(() => {
    if (!enabled) return;
    const c = counter.current;
    let sending = false;

    const flush = async () => {
      const minutes = c.take();
      if (minutes === 0 || sending) return c.restore(minutes);
      sending = true;
      try {
        const { unlockedTitles } = await addPlayTime(minutes);
        if (unlockedTitles.length) toast(translate('progression.newTitle'));
      } catch {
        c.restore(minutes);
      } finally {
        sending = false;
      }
    };

    const visible = () => document.visibilityState === 'visible';
    const timer = window.setInterval(() => {
      if (c.tick(visible())) void flush();
    }, MINUTE);
    const onVisibility = () => {
      if (!visible()) void flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      void flush();
    };
  }, [enabled]);
}
