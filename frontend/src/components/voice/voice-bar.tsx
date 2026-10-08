'use client';

/**
 * Barre vocale de la table (docs/voix.md § 6) : en haut à droite, rejoindre la voix, puis les
 * portraits de ceux qui sont dans la salle (anneau quand ils parlent), micro, son, volume et
 * départ. Avant d'entrer, les portraits de ceux qui y sont déjà.
 *
 * Canal privé (docs/voix.md § 5) : le MJ ouvre un aparté depuis le portrait d'un joueur ; les
 * deux portraits portent un cadenas, et chacun des deux peut y mettre fin.
 */
import type { VoiceParticipant } from '@vtt/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  HeadphoneOff,
  Headphones,
  Loader2,
  Lock,
  LockOpen,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';
import { HUD_BAR, HUD_CONTROL } from '@/components/combat/live-reports/look';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import { ApiError, messageErreur } from '@/lib/api';
import type { Membre } from '@/lib/campagnes';
import { useCampaignEvents } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { getVoiceRoom } from '@/lib/voice/api';
import { getVoice, useVoice, useVoiceBridge } from '@/lib/voice/hooks';

const VOICE_TYPES = ['voice.*'] as const;
const NOBODY: readonly VoiceParticipant[] = [];
/** Portraits affichés au plus ; au-delà, un compteur. */
const MAX_FACES = 6;

export const VoiceBar = memo(function VoiceBar({
  campaignId,
  me,
  gm,
  members,
}: Readonly<{ campaignId: string; me: string; gm: boolean; members: readonly Membre[] }>) {
  const t = useTranslations('table.voice');
  useVoiceBridge(campaignId);
  const here = useVoice((s) => s.campaignId === campaignId);
  const status = useVoice((s) => (here ? s.status : 'idle'));
  const joined = status === 'connected';
  const live = useVoice((s) => s.participants);
  const speaking = useVoice((s) => s.speaking);
  const muted = useVoice((s) => s.muted);
  const deafened = useVoice((s) => s.deafened);
  const listenOnly = useVoice((s) => s.listenOnly);
  const error = useVoice((s) => s.error);

  // Avant d'entrer : qui est déjà dans la salle, relu à chaque annonce
  const qc = useQueryClient();
  const key = ['voice', campaignId] as const;
  const room = useQuery({
    queryKey: key,
    queryFn: () => getVoiceRoom(campaignId),
    enabled: !joined,
    retry: false,
    staleTime: 30_000,
  });
  useCampaignEvents(campaignId, VOICE_TYPES, () => void qc.invalidateQueries({ queryKey: key }), {
    enabled: !joined,
  });
  const participants = joined ? live : (room.data?.participants ?? NOBODY);

  const join = useCallback(() => void getVoice().join(campaignId, me), [campaignId, me]);
  const memberOf = (userId: string) => members.find((m) => m.userId === userId);

  const faces = [...participants].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const shown = faces.slice(0, MAX_FACES);
  const nameOf = (userId: string) => (userId === me ? t('you') : (memberOf(userId)?.name ?? '?'));
  const partner = joined ? (live.find((p) => p.userId === me)?.privateWith ?? null) : null;
  const failed = (e: unknown) => toast.error(messageErreur(e, t('unavailable')));

  return (
    <div className={cn(HUD_BAR, 'max-w-full')}>
      {shown.length > 0 && (
        <div className="flex items-center -space-x-1.5 px-1">
          {shown.map((p) => {
            const m = memberOf(p.userId);
            const name = nameOf(p.userId);
            const label = p.privateWith
              ? t('inPrivate', { name, other: nameOf(p.privateWith) })
              : p.muted
                ? t('muted', { name })
                : name;
            const face = (
              <span className="relative">
                <Avatar
                  className={cn(
                    'size-8 ring-2 ring-popover transition-shadow',
                    joined && speaking.has(p.userId) && 'ring-success',
                  )}
                >
                  {m?.avatarUrl && <AvatarImage src={m.avatarUrl} alt="" />}
                  <AvatarFallback className="text-xs">
                    {name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {p.privateWith && (
                  <Lock className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-popover p-0.5 text-primary" />
                )}
                {p.muted && (
                  <MicOff className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-popover p-0.5 text-destructive" />
                )}
              </span>
            );
            // MJ : un aparté s'ouvre depuis le portrait d'un joueur qui parle
            const whisper = gm && joined && p.userId !== me && p.speaker;
            return (
              <FaceMenu
                key={p.userId}
                label={label}
                enabled={whisper}
                item={
                  p.privateWith === me
                    ? { text: t('endPrivate'), run: () => getVoice().closePrivate().catch(failed) }
                    : {
                        text: t('talkPrivate', { name }),
                        run: () => getVoice().openPrivate(p.userId).catch(failed),
                      }
                }
              >
                {face}
              </FaceMenu>
            );
          })}
          {faces.length > MAX_FACES && (
            <span className="pl-2 font-mono text-xs text-muted-foreground">
              +{faces.length - MAX_FACES}
            </span>
          )}
        </div>
      )}

      {status === 'idle' || status === 'error' ? (
        <Info
          texte={status === 'error' ? failureText(error, t('unavailable')) : t('join')}
          cote="bottom"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(HUD_CONTROL, status === 'error' && 'text-destructive')}
            aria-label={t('join')}
            onClick={join}
          >
            <Headphones />
          </Button>
        </Info>
      ) : status === 'connecting' ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className={HUD_CONTROL}
          aria-label={t('connecting')}
          disabled
        >
          <Loader2 className="animate-spin" />
        </Button>
      ) : (
        <>
          {partner && (
            <Info texte={t('endPrivateWith', { name: nameOf(partner) })} cote="bottom">
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(HUD_CONTROL, 'bg-primary/15 text-primary hover:bg-primary/20')}
                aria-label={t('endPrivate')}
                onClick={() => void getVoice().closePrivate().catch(failed)}
              >
                <LockOpen />
              </Button>
            </Info>
          )}
          <Info
            texte={listenOnly ? t('listenOnly') : muted ? t('unmute') : t('mute')}
            cote="bottom"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(HUD_CONTROL, (muted || listenOnly) && 'text-destructive')}
              aria-label={muted ? t('unmute') : t('mute')}
              aria-pressed={muted}
              disabled={listenOnly}
              onClick={() => getVoice().setMuted(!muted)}
            >
              {muted || listenOnly ? <MicOff /> : <Mic />}
            </Button>
          </Info>
          <Info texte={deafened ? t('undeafen') : t('deafen')} cote="bottom">
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(HUD_CONTROL, deafened && 'text-destructive')}
              aria-label={deafened ? t('undeafen') : t('deafen')}
              aria-pressed={deafened}
              onClick={() => getVoice().setDeafened(!deafened)}
            >
              {deafened ? <HeadphoneOff /> : <Headphones />}
            </Button>
          </Info>
          <VolumeButton label={t('volume')} />
          <Info texte={t('leave')} cote="bottom">
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn(HUD_CONTROL, 'text-destructive')}
              aria-label={t('leave')}
              onClick={() => void getVoice().leave()}
            >
              <PhoneOff />
            </Button>
          </Info>
        </>
      )}
    </div>
  );
});

/** Portrait : infobulle ; pour le MJ, un menu (aparté). */
function FaceMenu({
  label,
  enabled,
  item,
  children,
}: Readonly<{
  label: string;
  enabled: boolean;
  item: { text: string; run: () => unknown };
  children: ReactNode;
}>) {
  if (!enabled)
    return (
      <Info texte={label} cote="bottom">
        {children}
      </Info>
    );
  return (
    <DropdownMenu>
      <Info texte={label} cote="bottom">
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded-full" aria-label={label}>
            {children}
          </button>
        </DropdownMenuTrigger>
      </Info>
      <DropdownMenuContent side="bottom" align="end">
        <DropdownMenuItem onSelect={() => void item.run()}>
          <Lock />
          {item.text}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Raison d'un échec : le message du service, sinon celui du navigateur (WebRTC, micro). */
function failureText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return messageErreur(error, fallback);
  return error instanceof Error && error.message ? `${fallback} : ${error.message}` : fallback;
}

function VolumeButton({ label }: Readonly<{ label: string }>) {
  const volume = useVoice((s) => s.volume);
  return (
    <Popover>
      <Info texte={label} cote="bottom">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" className={HUD_CONTROL} aria-label={label}>
            <Volume2 />
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent side="bottom" align="end" className="w-48 p-3">
        <Slider
          aria-label={label}
          min={0}
          max={100}
          step={1}
          value={[Math.round(volume * 100)]}
          onValueChange={([v]) => getVoice().setVolume((v ?? 100) / 100)}
        />
      </PopoverContent>
    </Popover>
  );
}
