'use client';

/**
 * Barre du groupe (docs/carte.md § 11), en haut à gauche de la table, la sortie (retour au salon)
 * en tête : les personnages de la scène, leur ressource principale en anneau autour du portrait
 * (couleur selon l'état, sens inversé pour une ressource qui se remplit). Le MJ bascule entre
 * héros et PNJ.
 *
 * Un clic sur un portrait ouvre sa carte : centrer la vue sur son token, ouvrir la fiche,
 * ajuster la ressource (MJ, ou son propre héros), écrire en privé à son joueur. Double clic :
 * centrer.
 */
import { translate } from '@/i18n/runtime';
import {
  ArrowLeft,
  Crosshair,
  EyeOff,
  Flag,
  IdCard,
  MessageSquare,
  SendHorizontal,
  Swords,
  Users,
  VenetianMask,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { HUD_BAR, HUD_CONTROL } from '@/components/combat/live-reports/look';
import { EndCombatDialog } from '@/components/combat/turns/combat-dialogs';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useHudPrefs } from '@/components/table/hud-prefs';
import { TABLE_HUD_LEFT } from '@/components/table/hud-slots';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { useCombat } from '@/lib/combat/use-combat';
import { chatApi } from '@/lib/campaign-chat';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import {
  isNpc,
  TOKENS_COLLECTION,
  type CharacterInfo,
  type ResourceGauge,
  type TokenData,
} from '@/lib/map/features/tokens/engine/model';
import type { TokensState } from '@/lib/map/features/tokens/engine/state';
import { collectionOf } from '@/lib/map/store/map-store';
import { cn } from '@/lib/utils';
import { useMapEngine, useMapState } from '@/components/map/engine-context';
import { ResourceEditor } from '@/lib/map/features/tokens/ui/resource-editor';
import { useTokens } from '@/lib/map/features/tokens/ui/use-tokens';

type Mode = 'players' | 'npcs';

interface Member {
  info: CharacterInfo;
  /** Portrait, sinon l'image de son token sur la scène (PNJ), sinon son token du Studio. */
  image: string | null;
  /** Premier token du personnage sur la scène (pour centrer la vue). */
  tokenId: string;
}

/** Portraits montrés avant le « +N ». */
const SHOWN = 6;

/** Part « en bonne santé » d'une ressource, de 0 à 1. */
function health(r: ResourceGauge): number {
  if (r.max <= 0) return 1;
  const f = Math.min(1, Math.max(0, r.value / r.max));
  return r.rising ? 1 - f : f;
}

const toneOf = (r: ResourceGauge | null) => {
  if (!r) return 'text-border-strong';
  const h = health(r);
  if (h > 0.5) return 'text-success';
  return h > 0.25 ? 'text-warning' : 'text-destructive';
};

/** Personnages de la scène (un par personnage, dans l'ordre des tokens), selon le mode. */
function useMembers(tokens: TokensState, mode: Mode, mine: readonly string[]): readonly Member[] {
  const list = useMapState((s) => collectionOf(s, TOKENS_COLLECTION));
  const subscribe = useCallback(
    (cb: () => void) => tokens.directory.subscribe(() => cb()),
    [tokens.directory],
  );
  const infos = useSyncExternalStore(
    subscribe,
    () => tokens.directory.list(),
    () => tokens.directory.list(),
  );
  // Membres d'avant gardés tels quels s'ils n'ont pas changé : un token déplacé (la collection
  // change à chaque lâcher) ne redessine pas les avatars
  const previous = useRef<readonly Member[]>([]);
  const members = useMemo(() => {
    const byId = new Map(infos.map((i) => [i.id, i]));
    const seen = new Set<string>();
    const out: Member[] = [];
    for (const [tokenId, t] of list) {
      const id = (t as unknown as TokenData).characterId;
      if (!id || seen.has(id)) continue;
      const info = byId.get(id);
      if (!info || (mode === 'npcs') !== isNpc(info)) continue;
      seen.add(id);
      const image =
        info.portraitUrl ?? (t as unknown as TokenData).imageUrl ?? info.tokenUrl ?? null;
      out.push({ info, tokenId, image });
    }
    // Les miens d'abord
    out.sort((a, b) => Number(mine.includes(b.info.id)) - Number(mine.includes(a.info.id)));
    const before = new Map(previous.current.map((m) => [m.info.id, m]));
    const stable = out.map((m) => {
      const old = before.get(m.info.id);
      return old && old.info === m.info && old.tokenId === m.tokenId && old.image === m.image
        ? old
        : m;
    });
    const same =
      stable.length === previous.current.length &&
      stable.every((m, i) => m === previous.current[i]);
    return same ? previous.current : stable;
  }, [list, infos, mode, mine]);
  useEffect(() => {
    previous.current = members;
  }, [members]);
  return members;
}

/** La barre, rendue dans l'emplacement en haut à gauche du HUD de la table (s'il existe). */
export function PartyBarHost() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById(TABLE_HUD_LEFT)), []);
  return target ? createPortal(<PartyBar />, target) : null;
}

export function PartyBar() {
  const engine = useMapEngine();
  const tokens = useTokens(engine);
  const viewer = engine.viewer;
  const gm = viewer.role === 'gm';
  const campaignId = useMapState((s) => s.campaignId);
  const [mode, setMode] = useState<Mode>('players');
  const members = useMembers(tokens, gm ? mode : 'players', viewer.characterIds);
  const shown = members.slice(0, SHOWN);
  const rest = members.slice(SHOWN);

  return (
    <div data-party-bar className={cn(HUD_BAR, 'max-w-[min(28rem,42vw)]')}>
      <Info texte={translate('table.scene.backToLobby')} cote="bottom">
        <Button variant="ghost" size="icon-sm" asChild className={cn(HUD_CONTROL, 'shrink-0')}>
          <Link href={`/campagnes/${campaignId}`} aria-label={translate('table.scene.backToLobby')}>
            <ArrowLeft />
          </Link>
        </Button>
      </Info>
      <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden />
      {gm && (
        <Info
          texte={
            mode === 'players' ? translate('map.party.showNpcs') : translate('map.party.showHeroes')
          }
          cote="bottom"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              mode === 'players'
                ? translate('map.party.showNpcs')
                : translate('map.party.showHeroes')
            }
            onClick={() => setMode((m) => (m === 'players' ? 'npcs' : 'players'))}
            className={cn(HUD_CONTROL, 'shrink-0', mode === 'npcs' && 'bg-primary/10 text-primary')}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={mode}
                initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 30, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="grid place-items-center"
              >
                {mode === 'players' ? <Users /> : <VenetianMask />}
              </motion.span>
            </AnimatePresence>
          </Button>
        </Info>
      )}

      {gm && <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden />}
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((m) => (
            <motion.div
              key={m.info.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            >
              <MemberAvatar
                engine={engine}
                tokens={tokens}
                member={m}
                mine={m.info.playedBy === viewer.userId}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {rest.length > 0 && <Overflow engine={engine} tokens={tokens} members={rest} />}
        {members.length === 0 && (
          <span className="px-2 text-xs text-subtle">
            {gm && mode === 'npcs' ? translate('map.party.noNpc') : translate('map.party.nobody')}
          </span>
        )}
      </div>

      {gm && campaignId && (
        <>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden />
          <CombatBarToggle campaignId={campaignId} />
        </>
      )}
    </div>
  );
}

/**
 * MJ : la barre de combat, rangée ou montrée. En plein combat, la ranger propose aussi de
 * terminer le combat (la fenêtre de la barre de combat).
 */
function CombatBarToggle({ campaignId }: Readonly<{ campaignId: string }>) {
  const on = useHudPrefs((s) => s.combatBar);
  const set = useHudPrefs((s) => s.setCombatBar);
  const combat = useCombat(campaignId).combat;
  const [ending, setEnding] = useState(false);
  const button = (onClick?: () => void) => (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={on ? translate('map.party.hideCombatBar') : translate('map.party.showCombatBar')}
      aria-pressed={on}
      onClick={onClick}
      className={cn(HUD_CONTROL, 'shrink-0', on && 'bg-primary/10 text-primary')}
    >
      <Swords />
    </Button>
  );
  if (!combat || !on)
    return (
      <Info
        texte={on ? translate('map.party.hideCombatBar') : translate('map.party.showCombatBar')}
        cote="bottom"
      >
        {button(() => set(!on))}
      </Info>
    );
  return (
    <>
      <DropdownMenu>
        <Info texte={translate('map.party.combatBar')} cote="bottom">
          <DropdownMenuTrigger asChild>{button()}</DropdownMenuTrigger>
        </Info>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => set(false)}>
            <EyeOff />
            {translate('map.party.hideBar')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setEnding(true)}
          >
            <Flag />
            {translate('map.party.endCombat')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EndCombatDialog
        open={ending}
        onOpenChange={setEnding}
        campaignId={campaignId}
        combat={combat}
        pendingReports={0}
      />
    </>
  );
}

/** Portrait cerclé de sa ressource ; un clic ouvre la carte du personnage. */
const MemberAvatar = memo(function MemberAvatar({
  engine,
  tokens,
  member,
  mine,
}: {
  engine: MapEngine;
  tokens: TokensState;
  member: Member;
  mine: boolean;
}) {
  const { info } = member;
  const r = info.resource;
  const name = info.name ?? translate('map.common.character');
  const down = r ? health(r) <= 0 : false;
  // En pleine forme : le rail seul ; la couleur ne dit que les dégâts
  const hurt = r ? health(r) < 0.999 : false;
  const size = 40;
  const radius = size / 2 - 1.25;
  const c = 2 * Math.PI * radius;
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Info
        texte={
          <span className="text-center">
            <span className="block font-semibold">{name}</span>
            {r && (
              <span className="block text-xs tabular-nums text-muted-foreground">
                {r.label} {r.value} / {r.max}
              </span>
            )}
          </span>
        }
        cote="bottom"
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={name}
            onDoubleClick={() => centerOn(engine, member)}
            className={cn(
              'relative grid shrink-0 place-items-center rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:hover:translate-y-0',
              open && '-translate-y-0.5',
            )}
            style={{ width: size, height: size }}
          >
            <svg
              viewBox={`0 0 ${size} ${size}`}
              className={cn('absolute inset-0 -rotate-90', toneOf(r))}
              aria-hidden
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth="2.5"
                className="stroke-border-strong"
              />
              {r && hurt && (
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - health(r))}
                  className="transition-[stroke-dashoffset] duration-500"
                />
              )}
            </svg>
            <Illustration
              largeur={size}
              src={member.image}
              graine={name}
              position="top"
              className={cn('size-[31px] rounded-full', down && 'opacity-60 grayscale')}
            />
            {/* Héros que j'incarne : un point d'accent, le rail ne parle que de la vie */}
            {mine && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-popover"
              />
            )}
          </button>
        </PopoverTrigger>
      </Info>
      <PopoverContent align="start" className="w-72 p-0">
        <MemberCard engine={engine} tokens={tokens} member={member} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
});

function centerOn(engine: MapEngine, member: Member) {
  const e = engine.entity(member.tokenId);
  if (e) engine.focusOn({ x: e.current.x, y: e.current.y });
}

/** Carte d'un personnage : ressource, actions, message privé. */
function MemberCard({
  engine,
  tokens,
  member,
  onDone,
}: Readonly<{
  engine: MapEngine;
  tokens: TokensState;
  member: Member;
  onDone(): void;
}>) {
  const { info } = member;
  const viewer = engine.viewer;
  const gm = viewer.role === 'gm';
  const mine =
    viewer.characterIds.includes(info.id) ||
    info.playedBy === viewer.userId ||
    info.ownerId === viewer.userId;
  const canSheet = gm || mine;
  const canWrite = info.playedBy !== null && info.playedBy !== viewer.userId;
  const [writing, setWriting] = useState(false);
  const name = info.name ?? translate('map.common.character');

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-3">
        <Illustration
          largeur={48}
          src={member.image}
          graine={name}
          position="top"
          className="size-12 shrink-0 rounded-xl ring-1 ring-border"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{name}</p>
          {info.resource && (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {info.resource.label} {info.resource.value} / {info.resource.max}
            </p>
          )}
        </div>
      </div>

      {info.resource && (gm || mine) && (
        <ResourceEditor characterId={info.id} resource={info.resource} />
      )}

      <div className="flex items-center gap-1 border-t border-border pt-2">
        <Info texte={translate('map.party.centerView')}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={translate('map.party.centerView')}
            onClick={() => {
              centerOn(engine, member);
              onDone();
            }}
          >
            <Crosshair />
          </Button>
        </Info>
        {canSheet && (
          <Info texte={translate('map.party.sheet')}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate('map.party.sheet')}
              onClick={() => {
                tokens.library.setState({ sheetFor: info.id });
                onDone();
              }}
            >
              <IdCard />
            </Button>
          </Info>
        )}
        {canWrite && (
          <Info texte={translate('map.party.whisper')}>
            <Button
              variant={writing ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={translate('map.party.whisper')}
              aria-pressed={writing}
              onClick={() => setWriting((w) => !w)}
            >
              <MessageSquare />
            </Button>
          </Info>
        )}
      </div>

      <AnimatePresence initial={false}>
        {writing && info.playedBy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <PrivateMessage
              campaignId={engine.store.getState().campaignId}
              to={info.playedBy}
              name={name}
              onSent={() => {
                setWriting(false);
                onDone();
              }}
              onCancel={() => setWriting(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Message privé au joueur du personnage (lui seul le lit, avec son auteur). */
function PrivateMessage({
  campaignId,
  to,
  name,
  onSent,
  onCancel,
}: Readonly<{
  campaignId: string;
  to: string;
  name: string;
  onSent(): void;
  onCancel(): void;
}>) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await chatApi.post(campaignId, body, { gm: false, userIds: [to] });
      toast.success(translate('map.party.whisperSent', { name }));
      onSent();
    } catch (err) {
      toast.error(translate('map.party.notSent'), { description: messageErreur(err) });
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <Input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void send();
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder={translate('map.party.whisperTo', { name })}
        aria-label={translate('map.party.whisperLabel', { name })}
        className="h-8"
        maxLength={2000}
      />
      <Button
        size="icon-sm"
        aria-label={translate('map.bubbles.send')}
        disabled={!text.trim()}
        loading={sending}
        onClick={() => void send()}
      >
        <SendHorizontal />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={translate('common.actions.close')}
        onClick={onCancel}
      >
        <X />
      </Button>
    </div>
  );
}

/** « +N » : les personnages au-delà des premiers, dans une liste. */
function Overflow({
  engine,
  tokens,
  members,
}: Readonly<{
  engine: MapEngine;
  tokens: TokensState;
  members: Member[];
}>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground"
          aria-label={translate('map.party.more', { count: members.length })}
        >
          +{members.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <ul className="max-h-80 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
          {members.map((m) => (
            <li key={m.info.id}>
              <button
                type="button"
                onClick={() => centerOn(engine, m)}
                onDoubleClick={() => tokens.library.setState({ sheetFor: m.info.id })}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2"
              >
                <Illustration
                  largeur={28}
                  src={m.image}
                  graine={m.info.name ?? '?'}
                  position="top"
                  className="size-7 shrink-0 rounded-full"
                />
                <span className="min-w-0 flex-1 truncate">{m.info.name}</span>
                {m.info.resource && (
                  <span className={cn('text-xs tabular-nums', toneOf(m.info.resource))}>
                    {m.info.resource.value}/{m.info.resource.max}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
