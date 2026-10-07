'use client';

/**
 * « Vous entendez » : le relevé réel de ce qui sonne dans cet onglet (moteur, deux fois par
 * seconde), musique, ambiance, effets, zones et écoutes comprises. Ce n'est pas l'état
 * supposé de la table : un son que plus rien ne réclame est coupé par le relevé lui-même.
 */
import { useTranslations } from 'next-intl';
import { formatter } from '@/i18n/runtime';
import { AudioLines, Headphones, MapPin, Music, VolumeX, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLiveSounds, useMixer, type LiveKind } from '@/lib/audio';

/** Icône de chaque sorte de son ; nom : `audio.kinds.<sorte>`. */
const KINDS: Record<LiveKind, typeof Music> = {
  music: Music,
  ambience: Wind,
  sfx: AudioLines,
  zones: MapPin,
  preview: Headphones,
};

/** Volumes personnels qui rendent un son inaudible : signalés, jamais silencieux sans le dire. */
const WATCHED = [{ bus: 'master' }, { bus: 'music' }, { bus: 'ambience' }, { bus: 'sfx' }] as const;

function SilencedWarning() {
  const t = useTranslations();
  const m = useMixer();
  if (!m.volumes || !m.muted) return null;
  const off = WATCHED.filter(({ bus }) => m.muted![bus] || m.volumes![bus] <= 0.001);
  if (!off.length) return null;
  const general = off.some((o) => o.bus === 'master');
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12px]"
    >
      <VolumeX className="size-4 shrink-0 text-warning" aria-hidden />
      <span className="min-w-0 flex-1">
        {general
          ? t('audio.live.allMuted')
          : t('audio.live.mutedFor', {
              buses: formatter().list(
                off.map((o) => t(`audio.buses.${o.bus}`).toLowerCase()),
                'and',
              ),
            })}
      </span>
      <Button
        size="xs"
        variant="secondary"
        onClick={() => {
          for (const { bus } of off) {
            if (m.muted![bus]) m.toggleMute(bus);
            if (m.volumes![bus] <= 0.001) m.setVolume(bus, 1);
          }
        }}
      >
        {t('common.actions.reset')}
      </Button>
    </div>
  );
}

export function LiveNow() {
  const live = useLiveSounds();
  return (
    <div className="space-y-2">
      <SilencedWarning />
      <LiveLine live={live} />
    </div>
  );
}

function LiveLine({ live }: Readonly<{ live: ReturnType<typeof useLiveSounds> }>) {
  const t = useTranslations();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-1.5 text-[12px]"
    >
      <span className="font-medium text-muted-foreground">{t('audio.live.hearing')}</span>
      {live.length === 0 ? (
        <span className="inline-flex items-center gap-1.5 text-subtle">
          <VolumeX className="size-3.5" aria-hidden />
          {t('audio.live.nothing')}
        </span>
      ) : (
        live.map((l) => {
          const Icon = KINDS[l.kind];
          const label = t(`audio.kinds.${l.kind}`);
          return (
            <span key={l.id} className="inline-flex min-w-0 items-center gap-1.5">
              <Icon
                className="size-3.5 shrink-0 animate-pulse-slow text-primary-strong motion-reduce:animate-none"
                aria-hidden
              />
              <span className="max-w-48 truncate text-foreground">{l.label || label}</span>
              <span className="text-subtle">{label.toLowerCase()}</span>
            </span>
          );
        })
      )}
    </div>
  );
}
