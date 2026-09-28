'use client';

/**
 * Un canal (musique ou ambiance) : ce qui joue, la vraie progression (heure
 * du serveur), et pour le MJ les commandes (précédent, lecture/pause, suivant,
 * arrêt, répétition, aléatoire, volume, déplacement dans la piste).
 */
import type { ChannelName, RepeatMode } from '@vtt/contracts';
import {
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Wind,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { messageErreur } from '@/lib/api';
import { useChannel, useChannelPosition } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { formatTime } from './parts';

const LABELS: Record<ChannelName, string> = { music: 'Musique', ambience: 'Ambiance' };
const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'track', track: 'off' };
const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: 'Sans répétition',
  all: 'Répéter la liste',
  track: 'Répéter la piste',
};

export function ChannelCard({
  campaignId,
  channel,
  gm,
}: {
  campaignId: string;
  channel: ChannelName;
  gm: boolean;
}) {
  const c = useChannel(campaignId, channel);
  const s = c.state;
  const position = useChannelPosition(channel);
  const duration = s?.track?.durationMs ?? null;
  const [dragging, setDragging] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  useEffect(() => setVolume(null), [s?.volume]);

  const run = (p: Promise<unknown>) =>
    p.catch((e) => {
      toast.error('Commande refusée', { description: messageErreur(e) });
    });

  const Icon = channel === 'music' ? Music : Wind;
  const playing = s?.status === 'playing';
  const hasTrack = !!s?.track;
  const repeat = s?.repeat ?? 'all';

  return (
    <section
      aria-label={LABELS[channel]}
      className="rounded-xl border border-border bg-surface-2/60 p-3 shadow-surface"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg border border-border-strong',
            playing ? 'bg-primary/15 text-primary-strong' : 'bg-surface-3 text-muted-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">
            {LABELS[channel]}
            {s && s.queueLength > 1 && s.queueIndex !== null && (
              <span className="ml-1.5 normal-case tracking-normal">
                · {s.queueIndex + 1}/{s.queueLength}
              </span>
            )}
          </p>
          <p className="truncate text-sm font-medium" title={s?.track?.name}>
            {s?.track ? (s.track.deleted ? 'Son introuvable' : s.track.name) : 'Silence'}
          </p>
          {s?.next && playing && (
            <p className="truncate text-[11px] text-muted-foreground">Ensuite : {s.next.name}</p>
          )}
        </div>
        {s?.track?.source === 'youtube' && <Badge ton="danger">YouTube</Badge>}
        {s && !playing && hasTrack && (
          <Badge>{s.status === 'paused' ? 'En pause' : 'Arrêté'}</Badge>
        )}
      </div>

      {hasTrack && (
        <div className="mt-3">
          {gm && duration ? (
            <Slider
              aria-label="Position dans la piste"
              min={0}
              max={duration}
              step={1000}
              value={[dragging ?? Math.min(position, duration)]}
              onValueChange={([v]) => setDragging(v ?? 0)}
              onValueCommit={([v]) => {
                setDragging(null);
                void run(c.seek(v ?? 0));
              }}
            />
          ) : (
            <div
              className="relative my-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
              aria-hidden
            >
              <div
                className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-200"
                style={{
                  width: duration ? `${Math.min(100, (position / duration) * 100)}%` : '0%',
                }}
              />
            </div>
          )}
          <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>{formatTime(dragging ?? position)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      {gm && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Piste précédente"
            disabled={!hasTrack || c.pending}
            onClick={() => void run(c.previous())}
          >
            <SkipBack />
          </Button>
          <Button
            size="icon-sm"
            aria-label={playing ? 'Pause' : 'Lecture'}
            disabled={!hasTrack || c.pending}
            onClick={() => void run(playing ? c.pause() : c.resume())}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Piste suivante"
            disabled={!hasTrack || c.pending}
            onClick={() => void run(c.next())}
          >
            <SkipForward />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Arrêter"
            disabled={!hasTrack || s?.status === 'stopped' || c.pending}
            onClick={() => void run(c.stop())}
          >
            <Square />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={REPEAT_LABELS[repeat]}
            title={REPEAT_LABELS[repeat]}
            aria-pressed={repeat !== 'off'}
            className={cn(repeat !== 'off' && 'text-primary-strong')}
            onClick={() => void run(c.configure({ repeat: NEXT_REPEAT[repeat] }))}
          >
            {repeat === 'track' ? <Repeat1 /> : <Repeat />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Lecture aléatoire"
            aria-pressed={!!s?.shuffle}
            className={cn(s?.shuffle && 'text-primary-strong')}
            onClick={() => void run(c.configure({ shuffle: !s?.shuffle }))}
          >
            <Shuffle />
          </Button>
          <div className="ml-auto flex w-28 items-center gap-2">
            <Slider
              aria-label={`Volume ${LABELS[channel].toLowerCase()} pour la table`}
              min={0}
              max={1}
              step={0.05}
              value={[volume ?? s?.volume ?? 1]}
              onValueChange={([v]) => setVolume(v ?? 1)}
              onValueCommit={([v]) => void run(c.configure({ volume: v ?? 1 }))}
            />
          </div>
        </div>
      )}
    </section>
  );
}
