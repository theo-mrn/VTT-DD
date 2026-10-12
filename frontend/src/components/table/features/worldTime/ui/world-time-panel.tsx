'use client';

import { useTranslations } from 'next-intl';
import { Pause, Play, Trash2 } from 'lucide-react';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  clock,
  currentMinutes,
  DAY,
  nextHour,
  partsOf,
  periodOf,
  SPEEDS,
  updateWorldTime,
  worldTime,
} from '../state';
import { useWorldTime } from './use-world-time';
import { PERIOD_ICON, PERIOD_TONE } from './period-icon';

/** Avancées d'un clic (minutes) ; libellé : `table.worldTime.advance.<clé>`. */
const ADVANCES = [
  ['tenMinutes', 10],
  ['oneHour', 60],
  ['fourHours', 240],
  ['longRest', 480],
  ['oneDay', DAY],
] as const;

/** Panneau du MJ : avancer le temps, le régler, le montrer ou le cacher aux joueurs. */
export function WorldTimePanel() {
  const t = useTranslations('table.worldTime');
  const { value, minutes } = useWorldTime();

  if (!value)
    return (
      <div className="space-y-3 p-4 text-center">
        <p className="text-sm text-muted-foreground">{t('none')}</p>
        <Button
          size="sm"
          onClick={() =>
            worldTime.set({ minutes: 8 * 60, visible: true, rate: 0, since: Date.now() })
          }
        >
          <Play />
          {t('start')}
        </Button>
      </div>
    );

  const p = partsOf(minutes);
  const period = periodOf(p.hour);
  const Icone = PERIOD_ICON[period];
  const regler = (m: number) => updateWorldTime(value, { minutes: m });
  /** Avancer de `delta` minutes à partir de l'heure présente. */
  const avancer = (delta: number) => regler(currentMinutes(value) + delta);

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-4 rounded-2xl bg-surface-2/50 p-4">
        <span
          className={cn(
            'grid size-12 place-items-center rounded-2xl bg-surface-3',
            PERIOD_TONE[period],
          )}
        >
          <Icone className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {t('day', { day: String(p.day) })} · {t(`periods.${period}`)}
          </p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">
            {clock(p.hour, p.minute)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{t('speedLabel')}</p>
          <Button
            size="icon-xs"
            variant={value.rate ? 'secondary' : 'default'}
            aria-label={value.rate ? t('pause') : t('play')}
            onClick={() => updateWorldTime(value, { rate: value.rate ? 0 : 1 })}
          >
            {value.rate ? <Pause /> : <Play />}
          </Button>
        </div>
        <PillGroup>
          <div className="grid grid-cols-5 gap-0.5 rounded-xl bg-surface-2/60 p-0.5">
            {SPEEDS.map(([cle, rate]) => {
              const on = value.rate === rate;
              return (
                <button
                  key={cle}
                  type="button"
                  aria-pressed={on}
                  title={t(`speedHints.${cle}`)}
                  onClick={() => updateWorldTime(value, { rate })}
                  className={cn(
                    'relative isolate h-8 rounded-lg text-[12px] font-medium transition-colors',
                    on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {on && <ActivePill className="bg-card shadow-surface ring-1 ring-border" />}
                  {t(`speeds.${cle}`)}
                </button>
              );
            })}
          </div>
        </PillGroup>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t('advanceLabel')}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {ADVANCES.map(([cle, minutes]) => (
            <button
              key={cle}
              type="button"
              onClick={() => avancer(minutes)}
              className="h-10 rounded-xl bg-surface-2/70 px-2 text-[13px] font-medium transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {t(`advance.${cle}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => regler(nextHour(Math.floor(currentMinutes(value)), 7))}
            className="h-10 rounded-xl bg-surface-2/70 px-2 text-[13px] font-medium transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {t('advance.nextMorning')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <Input
          type="number"
          min={1}
          value={p.day}
          aria-label={t('dayLabel')}
          onChange={(e) => {
            const jour = Math.max(1, Math.floor(Number(e.target.value) || 1));
            regler((jour - 1) * DAY + p.hour * 60 + p.minute);
          }}
          className="h-9 rounded-xl tabular-nums"
        />
        <Input
          type="time"
          value={clock(p.hour, p.minute)}
          aria-label={t('timeLabel')}
          onChange={(e) => {
            const [h, m] = e.target.value.split(':').map(Number);
            if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return;
            regler((p.day - 1) * DAY + h * 60 + m);
          }}
          className="h-9 rounded-xl tabular-nums"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="world-time-visible" className="text-[13px]">
          {t('visible')}
        </label>
        <Switch
          id="world-time-visible"
          checked={value.visible}
          onCheckedChange={(visible) => updateWorldTime(value, { visible })}
        />
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-subtle"
        onClick={() => worldTime.set(null)}
      >
        <Trash2 />
        {t('clear')}
      </Button>
    </div>
  );
}
