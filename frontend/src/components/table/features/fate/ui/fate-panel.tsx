'use client';

import { useTranslations } from 'next-intl';
import { Minus, Plus, Star } from 'lucide-react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { useCampaignEphemeral } from '@/lib/realtime';
import { useTable } from '../../../contexte';
import { enqueue } from '../../shared/outbox';
import { fate, fateActions, FATE_MAX, FATE_SPEND_KIND } from '../state';
import { FateToken } from './fate-token';

/**
 * Jetons de destin : le MJ règle la réserve (jetons et plafond) ; chacun peut en dépenser un.
 */
export function FatePanel() {
  const t = useTranslations('table.fate');
  const { campagne, gm, moi } = useTable();
  const p = useStore(fate.store, (s) => s.value);
  const { send, live } = useCampaignEphemeral(campagne.id, [FATE_SPEND_KIND], () => undefined);

  if (!p)
    return (
      <div className="space-y-3 p-4 text-center">
        <p className="text-sm text-muted-foreground">{gm ? t('none') : t('noneHint')}</p>
        {gm && (
          <Button size="sm" onClick={() => fateActions.set({ count: 3, max: 5 })}>
            <Star />
            {t('start')}
          </Button>
        )}
      </div>
    );

  const depenser = () => {
    if (gm) fateActions.spend(moi.name);
    else
      enqueue(`spend:${crypto.randomUUID()}`, () => send(FATE_SPEND_KIND, null, { gmOnly: true }));
  };

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap justify-center gap-1.5 rounded-2xl bg-surface-2/50 p-4">
        {Array.from({ length: p.max }, (_, i) => (
          <FateToken key={i} full={i < p.count} className="size-9" />
        ))}
      </div>

      <Button className="w-full" disabled={p.count === 0 || (!gm && !live)} onClick={depenser}>
        <Star />
        {t('spend')}
      </Button>

      {gm && (
        <div className="space-y-2">
          <Stepper
            label={t('tokens')}
            value={p.count}
            min={0}
            max={p.max}
            onChange={(count) => fateActions.set({ count })}
          />
          <Stepper
            label={t('max')}
            value={p.max}
            min={1}
            max={FATE_MAX}
            onChange={(max) => fateActions.set({ max })}
          />
        </div>
      )}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(v: number): void;
}>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px]">{label}</span>
      <span className="flex items-center rounded-full bg-surface-2">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`${label} −`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="rounded-full"
        >
          <Minus />
        </Button>
        <span className="w-7 text-center text-sm font-semibold tabular-nums">{value}</span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`${label} +`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="rounded-full"
        >
          <Plus />
        </Button>
      </span>
    </div>
  );
}
