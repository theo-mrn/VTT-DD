'use client';

import { useTranslations } from 'next-intl';
import { Pause, Play, Plus, Square } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatRemaining, timer as commandes } from '../state';
import { useTimer } from './use-timer';

/** Durées proposées d'un clic (secondes). */
const PRESETS = [30, 60, 120, 300, 600, 900] as const;

const presetLabel = (s: number) => (s < 60 ? `${s} s` : `${s / 60} min`);

/** Panneau du MJ : lancer un compte à rebours vu de toute la table, le suspendre, l'arrêter. */
export function TimerPanel() {
  const t = useTranslations('table.timer');
  const { timer, remaining } = useTimer();
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState('');

  const lancer = (secondes: number) => commandes.start(secondes * 1000, label.trim());
  const ratio = timer ? remaining / Math.max(1, timer.durationMs) : 0;

  return (
    <div className="space-y-5 p-4">
      {/* Minuteur en cours */}
      <div className="relative overflow-hidden rounded-2xl bg-surface-2/50 p-5 text-center">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {timer?.label || (timer ? ' ' : t('idle'))}
        </p>
        <p
          className={cn(
            'mt-1 text-5xl font-semibold tabular-nums tracking-tight',
            !timer && 'text-subtle',
            timer && remaining <= 10_000 && 'text-destructive',
          )}
        >
          {formatRemaining(timer ? remaining : 0)}
        </p>
        {timer && (
          <div className="mt-4 flex justify-center gap-1.5">
            {timer.endsAt === null ? (
              <Button size="sm" onClick={commandes.resume}>
                <Play />
                {t('resume')}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={commandes.pause}>
                <Pause />
                {t('pause')}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => commandes.add(30_000)}>
              <Plus />
              {t('addThirty')}
            </Button>
            <Button size="sm" variant="ghost" onClick={commandes.stop}>
              <Square />
              {t('stop')}
            </Button>
          </div>
        )}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1 origin-left bg-primary transition-transform duration-300 ease-linear"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>

      <Input
        value={label}
        maxLength={80}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t('labelPlaceholder')}
        aria-label={t('label')}
        className="h-9 rounded-xl"
      />

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t('presets')}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => lancer(s)}
              className="h-10 rounded-xl bg-surface-2/70 text-sm font-medium tabular-nums transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {presetLabel(s)}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const m = Number(minutes.replace(',', '.'));
          if (m > 0) lancer(Math.round(m * 60));
        }}
      >
        <Input
          type="number"
          min={0.1}
          max={600}
          step="any"
          inputMode="decimal"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder={t('minutes')}
          aria-label={t('custom')}
          className="h-9 rounded-xl"
        />
        <Button type="submit" size="sm" className="h-9" disabled={!(Number(minutes) > 0)}>
          <Play />
          {t('start')}
        </Button>
      </form>
    </div>
  );
}
