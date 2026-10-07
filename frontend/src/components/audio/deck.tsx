'use client';

/**
 * Ce qui joue sur un canal (musique ou ambiance), lisible d'un coup d'œil : titre, état,
 * progression ; pour le MJ, les commandes utiles seulement (lecture/pause au centre,
 * précédent/suivant pour la musique, arrêt), et le volume de la table. Répétition et
 * aléatoire (musique) restent accessibles sans encombrer.
 */
import { useTranslations } from 'next-intl';
import type { Translator } from '@/i18n/text';
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
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { usePanelVisible } from '@/components/table/panels/navigation';
import {
  useAudioStatus,
  useChannel,
  useChannelPosition,
  useChannelProgress,
  useLiveSounds,
} from '@/lib/audio';
import { cn } from '@/lib/utils';
import { formatTime } from './parts';

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'track', track: 'off' };

export function Deck({
  campaignId,
  channel,
  gm,
}: Readonly<{
  campaignId: string;
  channel: ChannelName;
  gm: boolean;
}>) {
  const t = useTranslations();
  const c = useChannel(campaignId, channel);
  const s = c.state;
  // Panneau gardé monté mais masqué : la position cesse de se rafraîchir
  const visible = usePanelVisible();
  const duration = s?.track?.durationMs ?? null;
  const [dragging, setDragging] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  useEffect(() => setVolume(null), [s?.volume]);

  const run = (p: Promise<unknown>) =>
    p.catch((e) => toast.error(t('audio.deck.refused'), { description: messageErreur(e) }));

  const Icon = channel === 'music' ? Music : Wind;
  const playing = s?.status === 'playing';
  // Ce qui s'entend vraiment ici (relevé du moteur), pas seulement ce que dit le serveur
  const live = useLiveSounds();
  const { needsUnlock } = useAudioStatus();
  const heard = live.some((l) => l.kind === channel);
  const hasTrack = !!s?.track && !s.track.deleted;
  const status = statusLabel(t, {
    hasTrack,
    playing,
    heard,
    needsUnlock,
    paused: s?.status === 'paused',
  });
  const trackLabel = trackLabelOf(t, s, hasTrack, channel);
  const statusTone = statusToneOf(heard, playing, needsUnlock);

  return (
    <section
      aria-label={t(`audio.kinds.${channel}`)}
      className={cn(
        'rounded-lg border px-2.5 py-2 transition-colors',
        heard ? 'border-primary/40 bg-primary/[0.06]' : 'border-border bg-surface-2/60',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            'size-4 shrink-0',
            heard
              ? 'animate-pulse-slow text-primary-strong motion-reduce:animate-none'
              : 'text-muted-foreground',
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
            <span
              className={cn('min-w-0 truncate', hasTrack ? 'font-medium' : 'text-muted-foreground')}
              title={s?.track?.name}
            >
              {trackLabel}
            </span>
            {hasTrack && <span className={cn('shrink-0 text-[11px]', statusTone)}>{status}</span>}
          </p>
          {hasTrack && (
            <DeckMeta
              channel={channel}
              state={s}
              duration={duration}
              dragging={dragging}
              active={visible}
            />
          )}
        </div>

        {gm && hasTrack && (
          <DeckControls
            channel={channel}
            control={c}
            playing={playing}
            volume={volume}
            onVolume={setVolume}
            run={run}
          />
        )}
      </div>

      {/* Progression : fine ; le MJ la fait glisser pour se déplacer dans le morceau */}
      {hasTrack && duration !== null && (
        <div className="mt-1.5">
          {gm ? (
            <DeckSeek
              channel={channel}
              duration={duration}
              dragging={dragging}
              active={visible}
              onDrag={setDragging}
              onSeek={(v) => {
                setDragging(null);
                void run(c.seek(v));
              }}
            />
          ) : (
            <DeckProgress channel={channel} active={visible} />
          )}
        </div>
      )}
    </section>
  );
}

type ChannelControl = ReturnType<typeof useChannel>;
type ChannelState = ChannelControl['state'];

/** Titre affiché : le morceau, « Son supprimé », ou rien en cours. */
function trackLabelOf(
  t: Translator,
  s: ChannelState,
  hasTrack: boolean,
  channel: ChannelName,
): string {
  if (s?.track?.deleted) return t('audio.deck.deleted');
  if (hasTrack) return s!.track!.name;
  return t('audio.deck.nothing', { channel: t(`audio.kinds.${channel}`) });
}

/** Couleur de l'état : entendu ici, bloqué par le navigateur, ou neutre. */
function statusToneOf(heard: boolean, playing: boolean, needsUnlock: boolean): string {
  if (heard) return 'text-primary-strong';
  if (playing && needsUnlock) return 'text-warning';
  return 'text-subtle';
}

/** Ligne sous le titre : canal, temps, rang dans la file et morceau suivant (musique). */
function DeckMeta({
  channel,
  state: s,
  duration,
  dragging,
  active,
}: Readonly<{
  channel: ChannelName;
  state: ChannelState;
  duration: number | null;
  dragging: number | null;
  active: boolean;
}>) {
  const t = useTranslations();
  const isMusic = channel === 'music';
  return (
    <p className="flex items-center gap-1.5 text-[11px] tabular-nums text-subtle">
      <span className="uppercase tracking-wide">{t(`audio.kinds.${channel}`)}</span>
      {duration !== null && (
        <span>
          · <DeckTime channel={channel} dragging={dragging} active={active} /> /{' '}
          {formatTime(duration)}
        </span>
      )}
      {isMusic && s && s.queueLength > 1 && s.queueIndex !== null && (
        <span>
          · {s.queueIndex + 1}/{s.queueLength}
        </span>
      )}
      {isMusic && s?.next && <span className="min-w-0 truncate">· ensuite {s.next.name}</span>}
    </p>
  );
}

/** Commandes du MJ : précédent et suivant (musique), lecture ou pause, arrêt, volume et options. */
function DeckControls({
  channel,
  control: c,
  playing,
  volume,
  onVolume,
  run,
}: Readonly<{
  channel: ChannelName;
  control: ChannelControl;
  playing: boolean;
  /** Volume glissé, pas encore envoyé. */
  volume: number | null;
  onVolume(v: number | null): void;
  run(p: Promise<unknown>): Promise<unknown>;
}>) {
  const t = useTranslations();
  const s = c.state;
  const isMusic = channel === 'music';
  return (
    <div className="flex shrink-0 items-center">
      {isMusic && (
        <Info texte={t('audio.deck.previous')}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('audio.deck.previous')}
            disabled={c.pending}
            onClick={() => void run(c.previous())}
          >
            <SkipBack />
          </Button>
        </Info>
      )}
      <Info texte={playing ? t('audio.deck.pause') : t('audio.deck.play')}>
        <Button
          size="icon-sm"
          aria-label={playing ? t('audio.deck.pauseLabel') : t('audio.deck.resume')}
          disabled={c.pending}
          onClick={() => void run(playing ? c.pause() : c.resume())}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
      </Info>
      {isMusic && (
        <Info texte={t('audio.deck.next')}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('audio.deck.next')}
            disabled={c.pending}
            onClick={() => void run(c.next())}
          >
            <SkipForward />
          </Button>
        </Info>
      )}
      <Info texte={t('audio.deck.stop')}>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t('audio.deck.stop')}
          disabled={s?.status === 'stopped' || c.pending}
          onClick={() => void run(c.stop())}
        >
          <Square />
        </Button>
      </Info>
      <Popover>
        <Info texte={t('audio.deck.tableVolume')}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t(`audio.deck.optionsOf.${channel}`)}
            >
              <SlidersHorizontal />
            </Button>
          </PopoverTrigger>
        </Info>
        <PopoverContent align="end" className="w-64 space-y-3 p-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t('audio.deck.volumeForTable')}
            </p>
            <div className="flex items-center gap-2">
              <Volume2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <Slider
                aria-label={t(`audio.deck.volumeOf.${channel}`)}
                min={0}
                max={1}
                step={0.05}
                value={[volume ?? s?.volume ?? 1]}
                onValueChange={([v]) => onVolume(v ?? 1)}
                onValueCommit={([v]) => void run(c.configure({ volume: v ?? 1 }))}
              />
            </div>
          </div>
          {isMusic && <MusicOptions control={c} run={run} />}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Répétition (liste, morceau, aucune) et lecture aléatoire de la musique. */
function MusicOptions({
  control: c,
  run,
}: Readonly<{ control: ChannelControl; run(p: Promise<unknown>): Promise<unknown> }>) {
  const t = useTranslations();
  const s = c.state;
  const repeat = s?.repeat ?? 'all';
  return (
    <div className="flex gap-1.5">
      <Button
        variant={repeat !== 'off' ? 'default' : 'secondary'}
        size="xs"
        aria-pressed={repeat !== 'off'}
        onClick={() => void run(c.configure({ repeat: NEXT_REPEAT[repeat] }))}
      >
        {repeat === 'track' ? <Repeat1 /> : <Repeat />}
        {t(`audio.deck.repeat.${repeat}`)}
      </Button>
      <Button
        variant={s?.shuffle ? 'default' : 'secondary'}
        size="xs"
        aria-pressed={!!s?.shuffle}
        onClick={() => void run(c.configure({ shuffle: !s?.shuffle }))}
      >
        <Shuffle />
        {t('audio.deck.shuffle')}
      </Button>
    </div>
  );
}

// Feuilles qui suivent la position : seules elles se re-rendent au fil de la lecture.

/** Temps écoulé, rafraîchi chaque seconde (la valeur glissée pendant un déplacement). */
function DeckTime({
  channel,
  dragging,
  active,
}: Readonly<{
  channel: ChannelName;
  dragging: number | null;
  active: boolean;
}>) {
  const position = useChannelPosition(channel, 1_000, active && dragging === null);
  return <>{formatTime(dragging ?? position)}</>;
}

/** Curseur de position du MJ (pas d'une seconde : un rafraîchissement par seconde suffit). */
function DeckSeek({
  channel,
  duration,
  dragging,
  active,
  onDrag,
  onSeek,
}: Readonly<{
  channel: ChannelName;
  duration: number;
  dragging: number | null;
  active: boolean;
  onDrag: (v: number) => void;
  onSeek: (v: number) => void;
}>) {
  const t = useTranslations();
  const position = useChannelPosition(channel, 1_000, active && dragging === null);
  return (
    <Slider
      aria-label={t('audio.deck.position')}
      min={0}
      max={duration}
      step={1000}
      value={[dragging ?? Math.min(position, duration)]}
      onValueChange={([v]) => onDrag(v ?? 0)}
      onValueCommit={([v]) => onSeek(v ?? 0)}
      className="py-1 [&_[role=slider]]:size-3"
    />
  );
}

/** Barre des joueurs : échelle horizontale écrite à chaque image, sans rendu React. */
function DeckProgress({ channel, active }: Readonly<{ channel: ChannelName; active: boolean }>) {
  const bar = useRef<HTMLDivElement>(null);
  useChannelProgress(channel, bar, active);
  return (
    <div className="relative h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
      <div
        ref={bar}
        className="absolute inset-0 origin-left rounded-full bg-primary will-change-transform"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );
}

/** État lisible d'un canal : ce qui s'entend vraiment, pas seulement ce que dit le serveur. */
function statusLabel(
  t: Translator,
  o: {
    hasTrack: boolean;
    playing: boolean;
    heard: boolean;
    needsUnlock: boolean;
    paused: boolean;
  },
): string {
  if (!o.hasTrack) return t('audio.deck.status.none');
  if (!o.playing) return o.paused ? t('audio.deck.status.paused') : t('audio.deck.status.stopped');
  if (o.heard) return t('audio.deck.status.playing');
  return o.needsUnlock ? t('audio.deck.status.blocked') : t('audio.deck.status.starting');
}
