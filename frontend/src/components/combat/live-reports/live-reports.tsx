'use client';

/**
 * Rapports en direct sous la barre de combat du MJ (docs/combat.md § 12.6). Chaque rapport qui
 * attend une décision sort de la barre dès qu'il arrive. Une seule carte dépliée (la plus
 * récente à décider, ou celle que le MJ choisit) ; les autres en lignes décidables d'un clic ;
 * attaques en cours et confirmations en lignes aussi. Trois au plus, « +n » déplie le reste ;
 * la pastille de la barre replie la pile. Pile au focus : Entrée applique la carte
 * dépliée, Suppr ne l'applique pas.
 */
import { useTranslations } from 'next-intl';
import type { CombatState } from '@vtt/contracts';
import { ScrollText } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type { KeyboardEvent } from 'react';
import { Info } from '@/components/ui/tooltip';
import type { DetailCampagne } from '@/lib/campagnes';
import { cn } from '@/lib/utils';
import { DecisionDrawer } from '../reports/decision-drawer';
import { DefeatedDialog } from '../reports/defeated-dialog';
import { combatPresentation } from '../turns/use-cast';
import {
  ProgressRow,
  ReportCard,
  ReportRow,
  rowDecision,
  nothingToApply,
  SettledRow,
} from './live-card';
import { EXIT, GLASS, NUMBER_SPRING, SPRING, TOUCH } from './look';
import type { LiveItem } from './model';
import { wholeScope, type LiveReports as Live } from './use-live-reports';

/** La pile se montre : des rapports à décider, en cours ou tout juste décidés. */
export const pileShown = (live: Live) => live.items.length > 0;

export function LiveReports({
  live,
  campagne,
  combat,
}: Readonly<{
  live: Live;
  campagne: DetailCampagne;
  combat: CombatState | null;
}>) {
  const t = useTranslations();
  const { stack, focus, busy } = live;
  const focused = stack.visible.find((i) => i.attack.id === focus)?.attack ?? null;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!focused || busy || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [role="menu"]')) return;
    // Un bouton garde sa propre touche Entrée
    if (e.key === 'Enter' && target.closest('button, a')) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      void live.decide(focused, wholeScope(focused), !nothingToApply(focused));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void live.decide(focused, rowDecision(focused).skip, false);
    }
  };

  const shown = pileShown(live) && !live.collapsed;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {shown && (
          <motion.section
            key="pile"
            aria-label={t('combat.live.title')}
            aria-keyshortcuts={'Enter Delete' /* i18n-ignore */}
            tabIndex={0}
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: EXIT }}
            transition={SPRING}
            className="pointer-events-none flex w-[min(26rem,100%)] flex-col items-stretch gap-1.5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <motion.ol
              layoutScroll
              className="pointer-events-auto flex max-h-[min(62vh,36rem)] flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-2xl [scrollbar-width:thin]"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {stack.visible.map((item, i) => (
                  <motion.li
                    key={item.attack.id}
                    // Mesurée quand le rang ou le dépli changent, pas à chaque rendu de la pile
                    layout
                    layoutDependency={`${i}:${item.attack.id === focus}`}
                    initial={{ opacity: 0, y: -16, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 24, scale: 0.98, transition: EXIT }}
                    transition={SPRING}
                    className="relative"
                  >
                    <Card item={item} live={live} expanded={item.attack.id === focus} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ol>
            <AnimatePresence initial={false}>
              {(stack.hidden > 0 || live.showAll) && (
                <motion.div
                  key="more"
                  layout
                  layoutDependency={stack.visible.length}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: EXIT }}
                  transition={SPRING}
                  className="flex justify-center"
                >
                  <button
                    type="button"
                    onClick={() => live.setShowAll(!live.showAll)}
                    aria-expanded={live.showAll}
                    aria-label={
                      live.showAll
                        ? t('combat.live.showFirst')
                        : t('combat.live.showMore', { count: stack.hidden })
                    }
                    className={cn(
                      GLASS,
                      'pointer-events-auto rounded-full px-3 py-1 font-mono text-xs font-semibold tabular text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      TOUCH,
                    )}
                  >
                    {live.showAll ? t('encounters.less') : `+${stack.hidden}`}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}
      </AnimatePresence>
      <DecisionDrawer
        campaignId={live.campaignId}
        attack={live.deciding}
        systeme={live.systeme}
        cast={live.cast}
        stateSorts={combatPresentation(live.presentation).stateSorts}
        onClose={() => live.setDeciding(null)}
      />
      <DefeatedDialog campagne={campagne} combat={combat} />
    </MotionConfig>
  );
}

/** Une place de la pile : la carte change de forme (ligne, dépliée, confirmée) en fondu. */
function Card({
  item,
  live,
  expanded,
}: Readonly<{ item: LiveItem; live: Live; expanded: boolean }>) {
  const a = item.attack;
  const settled = item.kind === 'settled' ? live.settled.get(a.id) : undefined;
  let shape: 'settled' | 'progress' | 'card' | 'row' = expanded ? 'card' : 'row';
  if (settled) shape = 'settled';
  else if (item.kind === 'progress') shape = 'progress';
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={shape}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
        transition={{ duration: 0.18 }}
      >
        {settled && (
          <SettledRow
            settled={settled}
            busy={live.busy === `${a.id}:undo`}
            onUndo={() => void live.undo(settled)}
            onClose={() => live.forget(a.id)}
          />
        )}
        {shape === 'progress' && (
          <ProgressRow
            attack={a}
            live={live}
            onRoll={() => void live.rollRest(a)}
            onCancel={() => void live.cancel(a)}
          />
        )}
        {shape === 'card' && <ReportCard attack={a} live={live} />}
        {shape === 'row' && <ReportRow attack={a} live={live} />}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Pastille des rapports dans la barre : combien attendent le MJ, et le repli de la pile. Une
 * attaque seulement en cours : un point qui respire.
 */
export function ReportsToggle({ live }: Readonly<{ live: Live }>) {
  const t = useTranslations();
  if (!pileShown(live)) return null;
  const { waiting } = live.stack;
  const label = live.collapsed ? t('combat.live.expand') : t('combat.live.collapse');
  return (
    <Info texte={label} cote="bottom">
      <button
        type="button"
        onClick={() => live.setCollapsed(!live.collapsed)}
        aria-expanded={!live.collapsed}
        aria-label={`${label}${waiting ? `, ${waiting} à décider` : ''}`}
        className={cn(
          'relative grid size-10 shrink-0 place-items-center rounded-[14px] transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          live.collapsed
            ? 'text-muted-foreground hover:text-foreground'
            : 'bg-surface-3 text-foreground',
          TOUCH,
        )}
      >
        <ScrollText className="size-4" aria-hidden />
        {waiting > 0 ? (
          <motion.span
            key={waiting}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={NUMBER_SPRING}
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold leading-none tabular text-primary-foreground shadow-glow"
          >
            {waiting}
          </motion.span>
        ) : (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 size-2 animate-pulse-few rounded-full bg-warning motion-reduce:animate-none"
          />
        )}
      </button>
    </Info>
  );
}
