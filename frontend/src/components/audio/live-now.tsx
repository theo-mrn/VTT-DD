'use client';

/**
 * « Vous entendez » : le relevé réel de ce qui sonne dans cet onglet (moteur, deux fois par
 * seconde), musique, ambiance, effets, zones et écoutes comprises. Ce n'est pas l'état
 * supposé de la table : un son que plus rien ne réclame est coupé par le relevé lui-même.
 */
import { AudioLines, Headphones, MapPin, Music, VolumeX, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLiveSounds, useMixer, type LiveKind } from '@/lib/audio';

const KINDS: Record<LiveKind, { label: string; icon: typeof Music }> = {
  music: { label: 'Musique', icon: Music },
  ambience: { label: 'Ambiance', icon: Wind },
  sfx: { label: 'Effet', icon: AudioLines },
  zones: { label: 'Zone', icon: MapPin },
  preview: { label: 'Écoute', icon: Headphones },
};

/** Volumes personnels qui rendent un son inaudible : signalés, jamais silencieux sans le dire. */
const WATCHED = [
  { bus: 'master', label: 'général' },
  { bus: 'music', label: 'musique' },
  { bus: 'ambience', label: 'ambiance' },
  { bus: 'sfx', label: 'effets' },
] as const;

function SilencedWarning() {
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
          ? 'Votre volume général est coupé : vous n’entendez rien.'
          : `Votre volume est coupé pour : ${off.map((o) => o.label).join(', ')}.`}
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
        Rétablir
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

function LiveLine({ live }: { live: ReturnType<typeof useLiveSounds> }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-1.5 text-[12px]"
    >
      <span className="font-medium text-muted-foreground">Vous entendez</span>
      {live.length === 0 ? (
        <span className="inline-flex items-center gap-1.5 text-subtle">
          <VolumeX className="size-3.5" aria-hidden />
          rien pour l’instant
        </span>
      ) : (
        live.map((l) => {
          const k = KINDS[l.kind];
          const Icon = k.icon;
          return (
            <span key={l.id} className="inline-flex min-w-0 items-center gap-1.5">
              <Icon className="size-3.5 shrink-0 animate-pulse text-primary-strong" aria-hidden />
              <span className="max-w-48 truncate text-foreground">{l.label || k.label}</span>
              <span className="text-subtle">{k.label.toLowerCase()}</span>
            </span>
          );
        })
      )}
    </div>
  );
}
