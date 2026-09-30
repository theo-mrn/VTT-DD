'use client';

/**
 * Barre de combat du MJ en haut de la table (docs/combat.md § 12.6), **pour le MJ seulement**
 * (décidé par Théo le 2026-09-30 : les joueurs ne l'ont plus) : round, suite J/E en créneaux,
 * portraits dans l'ordre, tour courant marqué, et de quoi mener les tours sans ouvrir le
 * panneau Combat : « Lancer l'initiative » tant qu'elle n'est pas tirée, Précédent, Suivant ;
 * la pastille des rapports en direct (`reports`) et le panneau Combat d'un clic.
 *
 * Le langage est celui du lanceur de dés et du bandeau de la fiche (`live-reports/look.ts`).
 * Noms et portraits viennent de la liste des personnages de la campagne.
 */
import type { CombatState } from '@vtt/contracts';
import { ChevronLeft, ChevronRight, Dices } from 'lucide-react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { combatFailure, useCombatCommands } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import { CTA, EXIT, GLASS, LABEL, NUMBER_SPRING, SPRING, TOUCH } from '../live-reports/look';
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

export function InitiativeStrip({
  campaignId,
  combat,
  reports,
}: {
  campaignId: string;
  combat: CombatState;
  /** Pastille des rapports en direct (repli de la pile). */
  reports?: ReactNode;
}) {
  const commands = useCombatCommands(campaignId);
  const cast = useCast(campaignId);
  const nameOf = (id: string) => cast.byId.get(id)?.name ?? 'Adversaire';
  const [busy, setBusy] = useState<string | null>(null);

  const rows = turnRows(combat);
  const actor = currentActorOf(combat);
  const slots = slotBar(combat);
  const currentSlot = combat.mode === 'slots' ? combat.slots?.[combat.currentIndex] : undefined;

  const run = async (key: string, label: string, work: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await work();
    } catch (err) {
      const message = combatFailure(err);
      if (message) toast.error(label, { description: message });
    } finally {
      setBusy(null);
    }
  };

  // Qui agit : le personnage du tour, le créneau d'un camp, rien avant l'initiative
  const headline = actor
    ? nameOf(actor)
    : currentSlot
      ? `Créneau des ${SIDE_LABELS[currentSlot.side].name.toLowerCase()}`
      : null;

  return (
    <MotionConfig reducedMotion="user">
      <section
        aria-label={`Combat, round ${combat.round}`}
        // Arrondis concentriques : barre 20 px, marge 6 px, commandes 40 px arrondies à 14 px ;
        // la même marge tout autour, jusqu'au dernier bouton
        className={cn(
          GLASS,
          'pointer-events-auto flex max-w-full items-center gap-1 rounded-[20px] p-1.5',
        )}
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
                    s.current
                      ? 'bg-primary text-primary-foreground shadow-glow'
                      : s.past
                        ? 'text-subtle'
                        : 'bg-surface-3 text-muted-foreground',
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
          portraitOf={(id) => cast.byId.get(id)?.portraitUrl}
        />

        {/* Largeur fixe : un nom plus long ou plus court ne fait jamais bouger la barre */}
        <span
          className="relative hidden h-5 w-36 shrink-0 overflow-hidden px-1.5 md:block"
          aria-live="polite"
        >
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
        </span>

        <Rule />

        {!combat.initiativeRolled ? (
          <Button
            size="sm"
            className={cn(CTA, 'h-10 rounded-[14px] px-4')}
            onClick={() =>
              void run('init', 'L’initiative n’a pas pu être lancée', () =>
                commands.rollInitiative(),
              )
            }
            loading={busy === 'init'}
            disabled={busy !== null}
          >
            <Dices />
            Lancer l’initiative
          </Button>
        ) : (
          <span className="flex shrink-0 items-center gap-1">
            <Info texte="Tour précédent" cote="bottom">
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn('size-10 rounded-[14px]', TOUCH)}
                aria-label="Tour précédent"
                onClick={() =>
                  void run('previous', 'Le retour arrière n’a pas pu se faire', () =>
                    commands.previous({ version: combat.version }),
                  )
                }
                loading={busy === 'previous'}
                disabled={busy !== null || combat.canGoBack === false}
              >
                <ChevronLeft />
              </Button>
            </Info>
            <Button
              size="sm"
              className={cn(CTA, 'group h-10 rounded-[14px] pl-4 pr-3')}
              onClick={() =>
                void run('next', 'Le tour n’a pas pu passer', () =>
                  commands.next({ version: combat.version }),
                )
              }
              loading={busy === 'next'}
              disabled={busy !== null || !combat.order.length}
            >
              Suivant
              <ChevronRight className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
            </Button>
          </span>
        )}

        {reports}
      </section>
    </MotionConfig>
  );
}

/** Filet vertical entre les groupes, comme ceux du bandeau de la fiche. */
function Rule() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border" />;
}

/** Round : libellé discret, chiffre en mono qui monte à chaque nouveau round. */
function Round({ round }: { round: number }) {
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
 * initiative attendue : point d'alerte.
 */
function Portraits({
  rows,
  nameOf,
  portraitOf,
}: {
  rows: readonly TurnRow[];
  nameOf(id: string): string;
  portraitOf(id: string): string | null | undefined;
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
            big
          />
        )}
        {next.length > 0 && (
          <li className="flex items-center">
            <ol className="flex items-center -space-x-2.5" aria-label="Ensuite">
              <AnimatePresence initial={false} mode="popLayout">
                {next.map((r, i) => (
                  <Face
                    key={r.characterId}
                    row={r}
                    name={nameOf(r.characterId)}
                    portrait={portraitOf(r.characterId)}
                    z={next.length - i}
                  />
                ))}
              </AnimatePresence>
            </ol>
            {more > 0 && (
              <span className="ml-1.5 font-mono text-[11px] text-subtle tabular">+{more}</span>
            )}
          </li>
        )}
      </ol>
    </LayoutGroup>
  );
}

/** Un portrait : grand et souligné pour qui agit, empilé pour les suivants. */
function Face({
  row: r,
  name,
  portrait,
  big = false,
  z,
}: {
  row: TurnRow;
  name: string;
  portrait: string | null | undefined;
  big?: boolean;
  z?: number;
}) {
  const state = r.current
    ? 'son tour'
    : r.pendingInitiative
      ? 'initiative attendue'
      : r.acted
        ? 'a agi'
        : null;
  return (
    <motion.li
      layout
      layoutId={`face-${r.characterId}`}
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
        <span className="relative block">
          <Illustration
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
        </span>
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
}
