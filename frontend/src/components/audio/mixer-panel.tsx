'use client';

/**
 * Mon mixeur : volumes et coupures par bus, enregistrés sur mon compte
 * (tous mes appareils). Chacun règle ce qu'il entend, sans toucher à la table.
 */
import { useTranslations } from 'next-intl';
import type { BusName } from '@vtt/contracts';
import { RotateCcw, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EditableValue } from '@/components/ui/editable-value';
import { Slider } from '@/components/ui/slider';
import { useMixer } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { SectionTitle } from './parts';

/** Bus du mixeur ; nom : `audio.buses.<bus>`. */
const BUSES: readonly BusName[] = ['master', 'music', 'ambience', 'sfx', 'zones', 'dice'];

export function MixerPanel() {
  const t = useTranslations();
  const m = useMixer();
  if (!m.volumes || !m.muted) return null;
  return (
    <section aria-label={t('audio.mixer.myVolume')}>
      <SectionTitle
        action={
          <Button variant="ghost" size="xs" onClick={() => m.reset()}>
            <RotateCcw />
            {t('audio.mixer.reset')}
          </Button>
        }
      >
        {t('audio.mixer.forMe')}
      </SectionTitle>
      <ul className="space-y-1.5">
        {BUSES.map((bus) => {
          const label = t(`audio.buses.${bus}`);
          const muted = m.muted![bus];
          const volume = m.volumes![bus];
          return (
            <li key={bus} className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={
                  muted
                    ? t('audio.mixer.unmute', { bus: label.toLowerCase() })
                    : t('audio.mixer.mute', { bus: label.toLowerCase() })
                }
                aria-pressed={muted}
                onClick={() => m.toggleMute(bus)}
                className={cn(muted && 'text-destructive')}
              >
                {muted ? <VolumeX /> : <Volume2 />}
              </Button>
              <span className={cn('w-32 shrink-0 text-[13px]', bus === 'master' && 'font-medium')}>
                {label}
              </span>
              <Slider
                aria-label={`Volume ${label.toLowerCase()}`}
                min={0}
                max={1}
                step={0.01}
                value={[volume]}
                disabled={muted}
                onValueChange={([v]) => m.setVolume(bus, v ?? 0)}
                className={cn(muted && 'opacity-50')}
              />
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                <EditableValue
                  label={`Volume ${label.toLowerCase()}`}
                  value={volume}
                  format={(v) => `${Math.round(v * 100)}%`}
                  min={0}
                  max={1}
                  scale={100}
                  disabled={muted}
                  onCommit={(v) => m.setVolume(bus, v)}
                  className="w-12"
                />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** « Mon volume » en bouton (MJ : le panneau est déjà chargé de commandes). */
export function MixerButton() {
  const t = useTranslations();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <SlidersHorizontal />
          {t('audio.mixer.myVolume')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <MixerPanel />
      </PopoverContent>
    </Popover>
  );
}
