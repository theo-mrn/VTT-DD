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
  SlidersHorizontal,
  Square,
  Volume2,
  Wind,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { useAudioStatus, useChannel, useChannelPosition, useLiveSounds } from '@/lib/audio';
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
  // Ce qui s'entend vraiment ici (relevé du moteur), pas seulement ce que dit le serveur
  const live = useLiveSounds();
  const { needsUnlock } = useAudioStatus();
  const heard = live.some((l) => l.kind === channel);
  const hasTrack = !!s?.track && !s.track.deleted;
  const isMusic = channel === 'music';
  const repeat = s?.repeat ?? 'all';
  const status = !hasTrack
    ? 'Rien en cours'
    : playing
      ? heard
        ? 'En lecture'
        : needsUnlock
          ? 'Son bloqué par le navigateur'
          : 'Démarrage…'
      : s?.status === 'paused'
        ? 'En pause'
        : 'Arrêté';

  const pct = hasTrack && duration ? Math.min(100, ((dragging ?? position) / duration) * 100) : 0;

  return (
    <section
      aria-label={LABELS[channel]}
      className={cn(
        'rounded-lg border px-2.5 py-2 transition-colors',
        heard ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-surface-2/60',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            'size-4 shrink-0',
            heard ? 'animate-pulse text-primary-strong' : 'text-muted-foreground',
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
            <span
              className={cn('min-w-0 truncate', hasTrack ? 'font-medium' : 'text-muted-foreground')}
              title={s?.track?.name}
            >
              {s?.track?.deleted
                ? 'Son supprimé'
                : hasTrack
                  ? s!.track!.name
                  : `${LABELS[channel]} : rien en cours`}
            </span>
            {hasTrack && (
              <span
                className={cn(
                  'shrink-0 text-[11px]',
                  heard
                    ? 'text-primary-strong'
                    : playing && needsUnlock
                      ? 'text-warning'
                      : 'text-subtle',
                )}
              >
                {status}
              </span>
            )}
          </p>
          {hasTrack && (
            <p className="flex items-center gap-1.5 text-[11px] tabular-nums text-subtle">
              <span className="uppercase tracking-wide">{LABELS[channel]}</span>
              {duration !== null && (
                <span>
                  · {formatTime(dragging ?? position)} / {formatTime(duration)}
                </span>
              )}
              {isMusic && s && s.queueLength > 1 && s.queueIndex !== null && (
                <span>
                  · {s.queueIndex + 1}/{s.queueLength}
                </span>
              )}
              {isMusic && s?.next && (
                <span className="min-w-0 truncate">· ensuite {s.next.name}</span>
              )}
            </p>
          )}
        </div>

        {gm && hasTrack && (
          <div className="flex shrink-0 items-center">
            {isMusic && (
              <Info texte="Morceau précédent">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Morceau précédent"
                  disabled={c.pending}
                  onClick={() => void run(c.previous())}
                >
                  <SkipBack />
                </Button>
              </Info>
            )}
            <Info texte={playing ? 'Pause' : 'Lecture'}>
              <Button
                size="icon-sm"
                aria-label={playing ? 'Mettre en pause' : 'Reprendre la lecture'}
                disabled={c.pending}
                onClick={() => void run(playing ? c.pause() : c.resume())}
              >
                {playing ? <Pause /> : <Play />}
              </Button>
            </Info>
            {isMusic && (
              <Info texte="Morceau suivant">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Morceau suivant"
                  disabled={c.pending}
                  onClick={() => void run(c.next())}
                >
                  <SkipForward />
                </Button>
              </Info>
            )}
            <Info texte="Arrêter">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Arrêter"
                disabled={s?.status === 'stopped' || c.pending}
                onClick={() => void run(c.stop())}
              >
                <Square />
              </Button>
            </Info>
            <Popover>
              <Info texte="Volume de la table et options">
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Volume et options de la ${LABELS[channel].toLowerCase()}`}
                  >
                    <SlidersHorizontal />
                  </Button>
                </PopoverTrigger>
              </Info>
              <PopoverContent align="end" className="w-64 space-y-3 p-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Volume pour toute la table
                  </p>
                  <div className="flex items-center gap-2">
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
                {isMusic && (
                  <div className="flex gap-1.5">
                    <Button
                      variant={repeat !== 'off' ? 'default' : 'secondary'}
                      size="xs"
                      aria-pressed={repeat !== 'off'}
                      onClick={() => void run(c.configure({ repeat: NEXT_REPEAT[repeat] }))}
                    >
                      {repeat === 'track' ? <Repeat1 /> : <Repeat />}
                      {REPEAT_LABELS[repeat]}
                    </Button>
                    <Button
                      variant={s?.shuffle ? 'default' : 'secondary'}
                      size="xs"
                      aria-pressed={!!s?.shuffle}
                      onClick={() => void run(c.configure({ shuffle: !s?.shuffle }))}
                    >
                      <Shuffle />
                      Aléatoire
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Progression : fine ; le MJ la fait glisser pour se déplacer dans le morceau */}
      {hasTrack && duration !== null && (
        <div className="mt-1.5">
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
              className="py-1 [&_[role=slider]]:size-3"
            />
          ) : (
            <div className="relative h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
