import { useTranslations } from 'next-intl';
import { Award, Circle, Lock } from 'lucide-react';
import { BORDURES } from '@/components/compte/elements';
import { translate } from '@/i18n/runtime';
import { Info } from '@/components/ui/tooltip';
import type { LevelReward } from '@/lib/progression';
import { cn } from '@/lib/utils';

/** « Titre « Héros Accompli » », « Bordure Azur ». */
export function rewardText(r: Pick<LevelReward, 'type' | 'id' | 'label'>): string {
  if (r.type === 'title') return translate('progression.rewardTitle', { name: r.label ?? r.id });
  const bordure = BORDURES.find((b) => b.id === r.id);
  return translate('progression.rewardBorder', {
    name: bordure ? translate(`account.borders.${bordure.id}`) : r.id,
  });
}

/** Paliers du niveau : atteints en couleur, les suivants verrouillés. */
export function RewardTrack({ rewards }: Readonly<{ rewards: LevelReward[] }>) {
  const t = useTranslations();
  return (
    <ol className="flex flex-wrap gap-2" aria-label={t('progression.rewards')}>
      {rewards.map((r) => {
        const Icon = r.reached ? (r.type === 'title' ? Award : Circle) : Lock;
        return (
          <li key={`${r.level}-${r.id}`}>
            <Info texte={rewardText(r)}>
              <span
                tabIndex={0}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  r.reached
                    ? 'border-primary/30 bg-primary/10 text-primary-strong'
                    : 'border-border text-subtle',
                )}
              >
                <Icon className="size-3.5" />
                {r.level}
              </span>
            </Info>
          </li>
        );
      })}
    </ol>
  );
}
