'use client';

/**
 * Ce qui joue sur un canal (musique ou ambiance), lisible d'un coup d'œil : titre, état,
 * progression ; pour le MJ, les commandes utiles seulement (lecture/pause au centre,
 * précédent/suivant pour la musique, arrêt), et le volume de la table. Répétition et
 * aléatoire (musique) restent accessibles sans encombrer.
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
  Volume2,
  Wind,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { useChannel, useChannelPosition } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { formatTime } from './parts';

const LABELS: Record<ChannelName, string> = { music: 'Musique', ambience: 'Ambiance' };
const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'track', track: 'off' };
const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: 'Répétition désactivée',
  all: 'Répéter la liste',
  track: 'Répéter ce morceau',
};

export function Deck({
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
    p.catch((e) => toast.error('Commande refusée', { description: messageErreur(e) }));

  const Icon = channel === 'music' ? Music : Wind;
  const playing = s?.status === 'playing';
  const hasTrack = !!s?.track && !s.track.deleted;
  const isMusic = channel === 'music';
  const repeat = s?.repeat ?? 'all';
  const status = !hasTrack
    ? 'Rien en cours'
    : playing
      ? 'En lecture'
      : s?.status === 'paused'
        ? 'En pause'
        : 'Arrêté';

  return (
    <section
      aria-label={LABELS[channel]}
      className={cn(
        'rounded-xl border p-3 transition-colors',
        playing ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-surface-2/60',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg',
            playing ? 'bg-primary/15 text-primary-strong' : 'bg-surface-3 text-muted-foreground',
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">{LABELS[channel]}</span>
            <span aria-hidden>·</span>
            <span className={cn(playing && 'text-primary-strong')}>{status}</span>
            {isMusic && s && s.queueLength > 1 && s.queueIndex !== null && (
              <span className="tabular-nums">
                · {s.queueIndex + 1}/{s.queueLength}
              </span>
            )}
          </p>
          <p
            className={cn(
              'truncate text-sm font-semibold',
              !hasTrack && 'font-normal text-muted-foreground',
            )}
            title={s?.track?.name}
          >
            {s?.track?.deleted
              ? 'Son supprimé de la bibliothèque'
              : hasTrack
                ? s!.track!.name
                : gm
                  ? isMusic
                    ? 'Choisissez une musique dans la bibliothèque'
                    : 'Choisissez une ambiance dans la bibliothèque'
                  : 'Silence'}
          </p>
          {isMusic && s?.next && hasTrack && (
            <p className="truncate text-[11px] text-muted-foreground">Ensuite : {s.next.name}</p>
          )}
        </div>
        {gm && hasTrack && (
          <Button
            size="icon"
            aria-label={playing ? 'Mettre en pause' : 'Reprendre la lecture'}
            disabled={c.pending}
            onClick={() => void run(playing ? c.pause() : c.resume())}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
        )}
      </div>

      {hasTrack && duration !== null && (
        <div className="mt-3">
          {gm ? (
            <Slider
              aria-label="Position dans le morceau"
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
            <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.min(100, (position / duration) * 100)}%` }}
              />
            </div>
          )}
          <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>{formatTime(dragging ?? position)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      {gm && hasTrack && (
        <div className="mt-2 flex items-center gap-1">
          {isMusic && (
            <>
              <Info texte="Morceau précédent">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Morceau précédent"
                  disabled={c.pending}
                  onClick={() => void run(c.previous())}
                >
                  <SkipBack />
                </Button>
              </Info>
              <Info texte="Morceau suivant">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Morceau suivant"
                  disabled={c.pending}
                  onClick={() => void run(c.next())}
                >
                  <SkipForward />
                </Button>
              </Info>
            </>
          )}
          <Info texte="Arrêter">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Arrêter"
              disabled={s?.status === 'stopped' || c.pending}
              onClick={() => void run(c.stop())}
            >
              <Square />
            </Button>
          </Info>
          {isMusic && (
            <>
              <Info texte={REPEAT_LABELS[repeat]}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={REPEAT_LABELS[repeat]}
                  aria-pressed={repeat !== 'off'}
                  className={cn(repeat !== 'off' && 'text-primary-strong')}
                  onClick={() => void run(c.configure({ repeat: NEXT_REPEAT[repeat] }))}
                >
                  {repeat === 'track' ? <Repeat1 /> : <Repeat />}
                </Button>
              </Info>
              <Info texte={s?.shuffle ? 'Lecture aléatoire activée' : 'Lecture dans l’ordre'}>
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
              </Info>
            </>
          )}
          <div className="ml-auto flex w-32 items-center gap-2">
            <Volume2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <Slider
              aria-label={`Volume de la ${LABELS[channel].toLowerCase()} pour toute la table`}
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
