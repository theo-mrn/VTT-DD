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
import { ChevronLeft, ChevronRight, Dices, Skull, Swords } from 'lucide-react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { PanelLink } from '@/components/table/panels/navigation';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { combatFailure, useCombatCommands } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import { CTA, EXIT, GLASS, LABEL, NUMBER_SPRING, SPRING, TOUCH } from '../live-reports/look';
import { SIDE_LABELS, currentActorOf, slotBar, turnRows, type TurnRow } from '../turns/model';
import { useCast } from '../turns/use-cast';

/** Au-delà, les portraits suivants sont résumés (« +4 »). */
const MAX_PORTRAITS = 12;

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
        className={cn(GLASS, 'pointer-events-auto flex max-w-full items-center gap-1 p-1')}
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

        <span
          className="hidden min-w-0 max-w-40 overflow-hidden px-1.5 md:block"
          aria-live="polite"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {headline && (
              <motion.span
                key={headline}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, transition: EXIT }}
                transition={SPRING}
                className="block truncate font-display text-sm font-semibold"
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
            className={cn('mx-0.5 h-8 px-3', CTA)}
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
          <span className="flex shrink-0 items-center gap-0.5">
            <Info texte="Tour précédent" cote="bottom">
              <Button
                variant="ghost"
                size="icon-sm"
                className={TOUCH}
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
              className={cn('group h-8 pl-3.5 pr-2.5', CTA)}
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

        <Info texte="Panneau Combat" cote="bottom">
          <Button variant="ghost" size="icon-sm" className={TOUCH} asChild>
            <PanelLink panel="combat" aria-label="Ouvrir le panneau Combat">
              <Swords />
            </PanelLink>
          </Button>
        </Info>
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
  const shown = rows.slice(0, MAX_PORTRAITS);
  return (
    <LayoutGroup id="combat-turn">
      <motion.div layoutScroll className="min-w-0 overflow-x-auto px-1 [scrollbar-width:none]">
        <ol className="flex items-center gap-1.5 py-2" aria-label="Ordre du tour">
          {shown.map((r) => {
            const name = nameOf(r.characterId);
            const state = r.current
              ? 'son tour'
              : r.defeated
                ? 'hors de combat'
                : r.pendingInitiative
                  ? 'initiative attendue'
                  : r.acted
                    ? 'a agi'
                    : null;
            return (
              <li
                key={r.characterId}
                aria-current={r.current ? 'step' : undefined}
                className="relative shrink-0"
              >
                <Info
                  cote="bottom"
                  texte={
                    <span className="flex items-baseline gap-2">
                      <span className="font-medium">{name}</span>
                      {r.score && <span className="font-mono text-subtle tabular">{r.score}</span>}
                      {state && state !== 'son tour' && (
                        <span className="text-subtle">{state}</span>
                      )}
                    </span>
                  }
                >
                  <motion.span
                    className="relative block"
                    animate={{
                      scale: r.current ? 1.14 : 1,
                      opacity: r.acted && !r.current ? 0.4 : 1,
                    }}
                    transition={SPRING}
                  >
                    <Illustration
                      src={portraitOf(r.characterId) ?? null}
                      graine={name}
                      position="top"
                      className={cn(
                        'size-8 rounded-full ring-2 ring-offset-2 ring-offset-popover transition-[box-shadow] duration-200',
                        r.current ? 'ring-primary' : 'ring-transparent',
                        r.defeated && 'grayscale',
                      )}
                    />
                    {r.defeated && (
                      <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full border border-border-strong bg-card text-destructive">
                        <Skull className="size-2.5" aria-hidden />
                      </span>
                    )}
                    {r.pendingInitiative && !r.defeated && (
                      <span
                        aria-hidden
                        className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warning ring-2 ring-popover"
                      />
                    )}
                    <span className="sr-only">
                      {name}
                      {state ? `, ${state}` : ''}
                    </span>
                  </motion.span>
                </Info>
                {r.current && (
                  <motion.span
                    layoutId="turn-marker"
                    aria-hidden
                    className="absolute -bottom-2 inset-x-1.5 h-0.5 rounded-full bg-primary shadow-glow"
                    transition={SPRING}
                  />
                )}
              </li>
            );
          })}
          {rows.length > MAX_PORTRAITS && (
            <li className="px-1 font-mono text-[11px] text-subtle tabular">
              +{rows.length - MAX_PORTRAITS}
            </li>
          )}
        </ol>
      </motion.div>
    </LayoutGroup>
  );
}
