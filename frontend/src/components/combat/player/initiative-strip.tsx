'use client';

/**
 * Barre de combat du MJ en haut de la table (docs/combat.md § 12.6), **pour le MJ seulement**
 * (décidé par Théo le 2026-09-30 : les joueurs ne l'ont plus) : round, suite J/E en créneaux,
 * portraits dans l'ordre, tour courant marqué, « Lancer l'initiative » tant qu'elle n'est pas
 * tirée, Précédent, Suivant ; la pastille des rapports en direct (`reports`) et le menu ⋯
 * (`menu`). Un portrait ouvre sa fiche de combat (`onFace`) ; « +n » et le nom de qui agit
 * déplient l'ordre complet sous la barre (`order`).
 *
 * Le langage est celui du lanceur de dés et du bandeau de la fiche (`live-reports/look.ts`).
 * Noms et portraits viennent de la liste des personnages de la campagne.
 */
import type { CombatState, CombatTurnResponse } from '@vtt/contracts';
import { ChevronLeft, ChevronRight, Dices, ListOrdered, Loader2 } from 'lucide-react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { combatFailure, useCombatCommands } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import {
  CTA,
  EXIT,
  GLASS,
  HUD_BAR,
  LABEL,
  NUMBER_SPRING,
  SPRING,
  TOUCH,
} from '../live-reports/look';
import { SIDE_LABELS, currentActorOf, slotBar, turnRows, type TurnRow } from '../turns/model';
import { useCast } from '../turns/use-cast';

/** Participants suivants montrés, empilés, après celui qui agit (le reste : « +n »). */
const UPCOMING = 4;

/**
 * Qui agit, puis les suivants dans l'ordre du tour (en repartant du début), sans les hors de
 * combat ; sans tour courant (initiative à lancer, créneau sans acteur), les premiers de l'ordre.
 */
export function upcomingRows<T extends { current: boolean; defeated: boolean }>(
  rows: readonly T[],
  max = UPCOMING,
): { current: T | null; next: T[]; more: number } {
  const at = rows.findIndex((r) => r.current);
  const current = at >= 0 ? rows[at]! : null;
  const rest = (at >= 0 ? [...rows.slice(at + 1), ...rows.slice(0, at)] : [...rows]).filter(
    (r) => !r.defeated,
  );
  return { current, next: rest.slice(0, max), more: Math.max(0, rest.length - max) };
}

/**
 * Décompte des durées qui n'a pas abouti, signalé au MJ (il sera rejoué au passage suivant) ;
 * les fins de durée sont annoncées à toute la table par `useDurationNotices`.
 */
function announceDurations(r: CombatTurnResponse, nameOf: (id: string) => string) {
  if (r.durationFailures?.length)
    toast.warning('Durées non décomptées ou non rendues pour certaines fiches', {
      description: r.durationFailures.map(nameOf).join(', '),
    });
}

/** Ordre complet déplié sous la barre (« +n », nom de qui agit). */
export interface StripOrder {
  open: boolean;
  onOpenChange(open: boolean): void;
  content: ReactNode;
}

export function InitiativeStrip({
  campaignId,
  combat,
  reports,
  menu,
  onFace,
  order,
}: Readonly<{
  campaignId: string;
  combat: CombatState;
  /** Pastille des rapports en direct (repli de la pile). */
  reports?: ReactNode;
  /** Menu ⋯ au bout de la barre. */
  menu?: ReactNode;
  /** Clic sur un portrait : la fiche de combat de ce participant. */
  onFace?(characterId: string): void;
  order?: StripOrder;
}>) {
  const commands = useCombatCommands(campaignId);
  const cast = useCast(campaignId);
  // Stables tant que la distribution ne change pas : les portraits (mémoïsés) n'en dépendent
  const castById = cast.byId;
  const nameOf = useCallback((id: string) => castById.get(id)?.name ?? 'Adversaire', [castById]);
  const portraitOf = useCallback((id: string) => castById.get(id)?.portraitUrl, [castById]);
  const onFaceRef = useRef(onFace);
  onFaceRef.current = onFace;
  const openFace = useCallback((id: string) => onFaceRef.current?.(id), []);
  const [busy, setBusy] = useState<string | null>(null);
  const barRef = useRef<HTMLElement | null>(null);

  const rows = useMemo(() => turnRows(combat), [combat]);
  const actor = currentActorOf(combat);
  const slots = slotBar(combat);
  const currentSlot = combat.mode === 'slots' ? combat.slots?.[combat.currentIndex] : undefined;

  const run = async <T,>(key: string, label: string, work: () => Promise<T>) => {
    setBusy(key);
    try {
      return await work();
    } catch (err) {
      const message = combatFailure(err);
      if (message) toast.error(label, { description: message });
      return null;
    } finally {
      setBusy(null);
    }
  };
  const turn = async (key: 'next' | 'previous', label: string) => {
    const r = await run(key, label, () => commands[key]({ version: combat.version }));
    if (r) announceDurations(r, nameOf);
  };

  // Qui agit : le personnage du tour, le créneau d'un camp, rien avant l'initiative
  let headline: string | null = null;
  if (actor) headline = nameOf(actor);
  else if (currentSlot)
    headline = `Créneau des ${SIDE_LABELS[currentSlot.side].name.toLowerCase()}`;

  const toggleOrder = order ? () => order.onOpenChange(!order.open) : undefined;

  const bar = (
    <section
      ref={barRef}
      aria-label={`Combat, round ${combat.round}`}
      // Arrondis concentriques : barre 20 px, marge 6 px, commandes 40 px arrondies à 14 px ;
      // la même marge tout autour, jusqu'au dernier bouton
      className={cn(HUD_BAR, 'max-w-full')}
    >
      <Round round={combat.round} />
      <Rule />

      {slots.length > 0 && (
        <>
          <ol className="hidden shrink-0 items-center gap-0.5 px-1 sm:flex" aria-label="Créneaux">
            {slots.map((s) => (
              <li
                key={s.index}
                aria-current={s.current ? 'step' : undefined}
                title={SIDE_LABELS[s.side].name}
                className={cn(
                  'grid size-6 place-items-center rounded-md font-mono text-[11px] font-bold transition-colors duration-200',
                  slotLook(s),
                )}
              >
                {SIDE_LABELS[s.side].short}
              </li>
            ))}
          </ol>
          <Rule />
        </>
      )}

      <Portraits
        rows={rows}
        nameOf={nameOf}
        portraitOf={portraitOf}
        onFace={onFace ? openFace : undefined}
        onMore={toggleOrder}
        moreOpen={order?.open ?? false}
      />

      {/* Largeur fixe : un nom plus long ou plus court ne fait jamais bouger la barre */}
      <Headline onClick={toggleOrder} open={order?.open ?? false}>
        <AnimatePresence initial={false}>
          {headline && (
            <motion.span
              key={headline}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: EXIT }}
              transition={SPRING}
              className="absolute inset-x-1.5 top-0 block truncate font-display text-sm font-semibold"
            >
              {headline}
            </motion.span>
          )}
        </AnimatePresence>
      </Headline>

      <Rule />

      <TurnControls
        combat={combat}
        busy={busy}
        onRollInitiative={() =>
          void run('init', 'L’initiative n’a pas pu être lancée', () => commands.rollInitiative())
        }
        onPrevious={() => void turn('previous', 'Le retour arrière n’a pas pu se faire')}
        onNext={() => void turn('next', 'Le tour n’a pas pu passer')}
      />

      {reports}
      {menu}
    </section>
  );

  return (
    <MotionConfig reducedMotion="user">
      {order ? (
        <Popover open={order.open} onOpenChange={order.onOpenChange}>
          <PopoverAnchor asChild>{bar}</PopoverAnchor>
          <PopoverContent
            align="center"
            sideOffset={8}
            // Un clic dans la barre (Suivant, « +n ») ne referme pas l'ordre : il suit le tour
            onInteractOutside={(e) => {
              if (e.target instanceof Node && barRef.current?.contains(e.target))
                e.preventDefault();
            }}
            className={cn(GLASS, 'w-[min(28rem,calc(100vw-2rem))] rounded-[20px] p-1.5')}
          >
            {order.content}
          </PopoverContent>
        </Popover>
      ) : (
        bar
      )}
    </MotionConfig>
  );
}

/** Lancer l'initiative, puis tour précédent et suivant. */
function TurnControls({
  combat,
  busy,
  onRollInitiative,
  onPrevious,
  onNext,
}: Readonly<{
  combat: CombatState;
  busy: string | null;
  onRollInitiative(): void;
  onPrevious(): void;
  onNext(): void;
}>) {
  if (!combat.initiativeRolled)
    return (
      <Button
        size="sm"
        className={cn(CTA, 'h-10 rounded-[14px] px-4')}
        onClick={onRollInitiative}
        disabled={busy !== null}
        aria-busy={busy === 'init' || undefined}
      >
        {busy === 'init' ? <Loader2 className="animate-spin" /> : <Dices />}
        Lancer l’initiative
      </Button>
    );
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Info texte="Tour précédent" cote="bottom">
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn('size-10 rounded-[14px]', TOUCH)}
          aria-label="Tour précédent"
          onClick={onPrevious}
          disabled={busy !== null || combat.canGoBack === false}
          aria-busy={busy === 'previous' || undefined}
        >
          {busy === 'previous' ? <Loader2 className="animate-spin" /> : <ChevronLeft />}
        </Button>
      </Info>
      <Button
        size="sm"
        className={cn(CTA, 'group h-10 rounded-[14px] pl-4 pr-3')}
        onClick={onNext}
        disabled={busy !== null || !combat.order.length}
        aria-busy={busy === 'next' || undefined}
      >
        Suivant
        {busy === 'next' ? (
          <Loader2 className="animate-spin" />
        ) : (
          <ChevronRight className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        )}
      </Button>
    </span>
  );
}

/** Nom de qui agit ; un clic déplie l'ordre complet. */
function Headline({
  onClick,
  open,
  children,
}: Readonly<{
  onClick?: () => void;
  open: boolean;
  children: ReactNode;
}>) {
  const box = 'relative hidden h-10 w-36 shrink-0 overflow-hidden px-1.5 md:block';
  if (!onClick)
    return (
      <span className={box} aria-live="polite">
        <span className="absolute inset-x-0 top-2.5 h-5 overflow-hidden">{children}</span>
      </span>
    );
  return (
    <Info texte="Ordre du tour" cote="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        aria-live="polite"
        className={cn(
          box,
          'rounded-[14px] text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          open && 'bg-surface-3',
        )}
      >
        <span className="absolute inset-x-0 top-2.5 h-5 overflow-hidden">{children}</span>
      </button>
    </Info>
  );
}

/** Filet vertical entre les groupes, comme ceux du bandeau de la fiche. */
function Rule() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border" />;
}

/** Round : libellé discret, chiffre en mono qui monte à chaque nouveau round. */
function Round({ round }: Readonly<{ round: number }>) {
  return (
    <span className="flex shrink-0 flex-col items-center gap-1 px-2 py-0.5">
      <span className={cn(LABEL, 'text-[10px] leading-none')}>Round</span>
      <span className="relative block h-5 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={round}
            initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, transition: EXIT }}
            transition={NUMBER_SPRING}
            className="block font-mono text-lg font-bold leading-5 tabular text-primary"
          >
            {round}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

/**
 * Portraits dans l'ordre du tour. Le tour courant est agrandi et souligné ; le trait glisse
 * d'un portrait à l'autre au passage du tour. A agi : estompé ; hors de combat : gris et crâne ;
 * initiative attendue : point d'alerte. Au bout de la pile, « +n » (ou l'icône de la liste)
 * déplie l'ordre complet.
 */
const Portraits = memo(function Portraits({
  rows,
  nameOf,
  portraitOf,
  onFace,
  onMore,
  moreOpen,
}: {
  rows: readonly TurnRow[];
  nameOf(id: string): string;
  portraitOf(id: string): string | null | undefined;
  onFace?(characterId: string): void;
  onMore?(): void;
  moreOpen: boolean;
}) {
  const { current, next, more } = upcomingRows(rows);
  return (
    <LayoutGroup id="combat-turn">
      <ol className="flex h-10 min-w-0 items-center gap-2 px-1" aria-label="Ordre du tour">
        {current && (
          <Face
            key={current.characterId}
            row={current}
            name={nameOf(current.characterId)}
            portrait={portraitOf(current.characterId)}
            onOpen={onFace}
            big
          />
        )}
        {(next.length > 0 || onMore) && (
          <li className="flex items-center">
            <ol className="flex items-center -space-x-2.5" aria-label="Ensuite">
              <AnimatePresence initial={false} mode="popLayout">
                {next.map((r, i) => (
                  <Face
                    key={r.characterId}
                    row={r}
                    name={nameOf(r.characterId)}
                    portrait={portraitOf(r.characterId)}
                    onOpen={onFace}
                    z={next.length - i + 1}
                  />
                ))}
              </AnimatePresence>
              {onMore && (
                <li className="relative shrink-0" style={{ zIndex: 0 }}>
                  <Info texte="Ordre du tour" cote="bottom">
                    <button
                      type="button"
                      onClick={onMore}
                      aria-expanded={moreOpen}
                      aria-label={more > 0 ? `Ordre du tour, ${more} de plus` : 'Ordre du tour'}
                      className={cn(
                        'grid size-7 place-items-center rounded-full font-mono text-[11px] font-semibold tabular ring-2 ring-popover transition-colors focus-visible:outline-none focus-visible:ring-ring/60',
                        moreOpen
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-surface-3 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {more > 0 ? `+${more}` : <ListOrdered className="size-3.5" aria-hidden />}
                    </button>
                  </Info>
                </li>
              )}
            </ol>
            {!onMore && more > 0 && (
              <span className="ml-1.5 font-mono text-[11px] text-subtle tabular">+{more}</span>
            )}
          </li>
        )}
      </ol>
    </LayoutGroup>
  );
});

/**
 * Un portrait : grand et souligné pour qui agit, empilé pour les suivants. Mémoïsé, et sa
 * place n'est mesurée (animation de mise en page) que quand elle peut changer.
 */
const Face = memo(function Face({
  row: r,
  name,
  portrait,
  onOpen,
  big = false,
  z,
}: {
  row: TurnRow;
  name: string;
  portrait: string | null | undefined;
  onOpen?(characterId: string): void;
  big?: boolean;
  z?: number;
}) {
  const state = turnState(r);
  const face = (
    <>
      <Illustration
        largeur={36}
        src={portrait ?? null}
        graine={name}
        position="top"
        className={cn(
          'rounded-full',
          big
            ? 'size-9 ring-2 ring-primary ring-offset-2 ring-offset-popover'
            : 'size-7 ring-2 ring-popover',
        )}
      />
      {r.pendingInitiative && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warning ring-2 ring-popover"
        />
      )}
      <span className="sr-only">
        {name}
        {state ? `, ${state}` : ''}
      </span>
    </>
  );
  return (
    <motion.li
      // Taille comprise : un suivant qui devient le tour courant grandit
      layout
      layoutId={`face-${r.characterId}`}
      layoutDependency={big ? 'big' : z}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: r.acted && !r.current ? 0.5 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={SPRING}
      aria-current={r.current ? 'step' : undefined}
      style={z !== undefined ? { zIndex: z } : undefined}
      className="relative shrink-0"
    >
      <Info
        cote="bottom"
        texte={
          <span className="flex items-baseline gap-2">
            <span className="font-medium">{name}</span>
            {r.score && <span className="font-mono text-subtle tabular">{r.score}</span>}
            {state && state !== 'son tour' && <span className="text-subtle">{state}</span>}
          </span>
        }
      >
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(r.characterId)}
            className="relative block rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:hover:translate-y-0"
          >
            {face}
          </button>
        ) : (
          <span className="relative block">{face}</span>
        )}
      </Info>
      {big && (
        <motion.span
          layoutId="turn-marker"
          aria-hidden
          className="absolute inset-x-1.5 -bottom-2 h-0.5 rounded-full bg-primary shadow-glow"
          transition={SPRING}
        />
      )}
    </motion.li>
  );
});

/** Créneau du round : en cours, passé, ou à venir. */
function slotLook(s: { current: boolean; past: boolean }): string {
  if (s.current) return 'bg-primary text-primary-foreground shadow-glow';
  return s.past ? 'text-subtle' : 'bg-surface-3 text-muted-foreground';
}

/** Où en est un participant dans le round (rien à dire : null). */
function turnState(r: { current: boolean; pendingInitiative: boolean; acted: boolean }) {
  if (r.current) return 'son tour';
  if (r.pendingInitiative) return 'initiative attendue';
  return r.acted ? 'a agi' : null;
}
