'use client';

/**
 * Menu d'attaque (docs/combat.md § 12.1), repris de l'ancienne page d'attaque : plein écran
 * (portail, fond assombri, défilement bloqué ; fenêtre large centrée sur ordinateur, tout
 * l'écran sur mobile), en-tête « versus », puis des étapes : Action, Préparer, Jet, Fin. Même
 * menu pour un joueur et pour le MJ (qui attaque avec un PNJ comme un joueur).
 *
 * L'état vit dans la machine `lib/combat/attack-flow.ts` (magasin de l'onglet) : la carte y
 * ajoute les cibles visées, la fiche et le panneau Combat l'ouvrent. « Viser sur la carte »
 * réduit la fenêtre à une pastille (`AimPill`) ; aucune clé de jeu : actions, paramètres, dés
 * et symboles viennent du système et de sa présentation.
 *
 * Clavier : 1 à 9 choisissent une action, Entrée lance l'attaque (ou reprend l'action mise en
 * avant), V vise sur la carte, Échap ferme.
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  History,
  Loader2,
  RotateCcw,
  Shield,
  Swords,
  Target,
  Undo2,
  UserRoundCog,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
import type { ContexteFiche } from '@/components/fiche/widgets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { shortcutCode } from '@/lib/keyboard';
import { useCampaignEphemeral } from '@/lib/realtime';
import { AimSender, aimMessage, COMBAT_AIM_KIND } from '@/lib/combat/aim';
import { flatActions } from '@/lib/combat/actions';
import { combatErrorMessage } from '@/lib/combat/api';
import {
  canGoBack,
  declaredStage,
  isMinimized,
  MENU_STAGE_LABELS,
  menuStage,
  visibleStages,
  type MenuStage,
} from '@/lib/combat/attack-flow';
import { attackMenu, useAttackFlow } from '@/lib/combat/attack-menu-store';
import { awaitingReaction, targetName } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { AimPill } from './aim-pill';
import { MyAttacks } from './my-attacks';
import { StepAction } from './step-action';
import { StepPrepare } from './step-prepare';
import { ReportStatus, StepRoll, useDeclaredAttack } from './step-roll';
import { useAttackContext, type AttackContext } from './use-attack-context';
import { useAttackModel, type AttackModel, type OpenFlow } from './use-attack-model';
import { VersusHeader } from './versus-header';

/** Menu d'attaque d'une campagne, s'il est ouvert pour elle. */
export function AttackMenu({
  campaignId,
  canAim,
}: {
  campaignId: string;
  /** Une carte est affichée : « Viser sur la carte » y est possible. */
  canAim: boolean;
}) {
  const flow = useAttackFlow((f) => f);
  if (flow.phase === 'closed' || flow.campaignId !== campaignId) return null;
  return <OpenMenu flow={flow} canAim={canAim} />;
}

const TYPING = 'input, textarea, select, [contenteditable="true"], [cmdk-root]';
/**
 * Éléments qu'Entrée active d'elle-même (bouton, lien) : on la leur laisse. Les options
 * (radios, bascules : Espace les coche) laissent Entrée lancer l'attaque.
 */
const PRESSABLE =
  'a[href], button:not([role="radio"]):not([role="switch"]):not([role="checkbox"]), [role="button"]';

function OpenMenu({ flow, canAim }: { flow: OpenFlow; canAim: boolean }) {
  const ctx = useAttackContext(flow.campaignId);
  const model = useAttackModel(flow, ctx);
  const attack = useDeclaredAttack(flow, model.commands);
  useAimBroadcast(flow);
  const reduced = useReducedMotion() ?? false;
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const draft = flow.draft;
  const composing = flow.phase === 'compose';
  const loading = ctx.loading || !ctx.systeme || (Boolean(draft.attackerId) && model.sheet.loading);
  const actionCount = model.actions.length;
  const revealed = flow.phase === 'declared' && revealedId === flow.attack.id;
  const stage = menuStage(flow, { actionCount: loading ? 2 : actionCount, revealed }) ?? 'action';
  const minimized = isMinimized(flow);
  const canAimNow = canAim && composing;
  const flat = useMemo(() => flatActions(model.groups), [model.groups]);

  const close = () => attackMenu.dispatch({ type: 'close' });
  const aim = () => {
    if (canAimNow) attackMenu.dispatch({ type: 'aim', on: true });
  };
  const back = () => attackMenu.dispatch({ type: 'setStep', step: 'action' });

  // Sens de la transition : en avant ou en arrière dans les étapes
  const order: MenuStage[] = ['action', 'prepare', 'roll', 'end'];
  const prev = useRef(stage);
  const direction = order.indexOf(stage) >= order.indexOf(prev.current) ? 1 : -1;
  useEffect(() => {
    prev.current = stage;
  }, [stage]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.altKey || e.repeat) return;
    const target = e.target as HTMLElement;
    const typing = Boolean(target.closest(TYPING));
    const mods = e.metaKey || e.ctrlKey || e.shiftKey;
    if (
      !typing &&
      !mods &&
      shortcutCode(e) === 'KeyV' &&
      canAimNow &&
      (stage === 'action' || stage === 'prepare')
    ) {
      e.preventDefault();
      aim();
      return;
    }
    if (stage === 'action' && composing && !typing && !mods) {
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      const a = digit ? flat[Number(digit[1]) - 1] : undefined;
      if (a) {
        e.preventDefault();
        model.choose(a);
        return;
      }
      if (e.key === 'Enter' && !target.closest(PRESSABLE) && model.action) {
        e.preventDefault();
        model.choose(model.action);
      }
      return;
    }
    if (stage === 'prepare' && e.key === 'Enter') {
      const forced = e.metaKey || e.ctrlKey;
      if (!forced && (typing || target.closest(PRESSABLE))) return;
      e.preventDefault();
      void model.submit();
    }
  }

  const fc: ContexteFiche | null =
    model.fiche && ctx.systeme && draft.attackerId
      ? {
          systeme: ctx.systeme,
          presentation: ctx.presentation,
          fiche: model.fiche,
          personnage: {
            id: draft.attackerId,
            name: model.sheet.name ?? ctx.known.get(draft.attackerId)?.name ?? 'Personnage',
            roomId: ctx.campagne?.id ?? null,
          },
          mj: ctx.gm,
        }
      : null;

  const standingBadge =
    draft.attackerId && model.standing !== 'free' && flow.phase !== 'declared' ? (
      model.standing === 'on_turn' ? (
        <Badge ton="primaire" taille="md">
          <Swords aria-hidden /> Son tour
        </Badge>
      ) : (
        <Badge ton={model.blocked ? 'danger' : 'alerte'} taille="md">
          <Clock aria-hidden /> {model.blocked ? 'Pas son tour' : 'Hors tour'}
        </Badge>
      )
    ) : null;

  return (
    <>
      <DialogPrimitive.Root
        open={!minimized}
        onOpenChange={(open) => {
          if (!open && flow.phase !== 'submitting') close();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/80 sm:bg-black/70 sm:backdrop-blur-[3px]',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none',
            )}
          />
          <DialogPrimitive.Content
            ref={contentRef}
            aria-describedby={undefined}
            // Le focus sur la fenêtre elle-même : Entrée lance, au lieu d'ouvrir « Mes attaques »
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              contentRef.current?.focus();
            }}
            onInteractOutside={(e) => e.preventDefault()}
            onKeyDown={onKeyDown}
            className="fixed inset-0 z-50 flex items-stretch justify-center outline-none sm:items-center sm:p-4"
          >
            <div
              className={cn(
                'relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground',
                'pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]',
                'sm:h-[min(48rem,calc(100dvh-2rem))] sm:max-w-[76rem] sm:rounded-[1.75rem] sm:border sm:border-border-strong sm:py-0 sm:shadow-elevated',
                'duration-200 animate-in fade-in-0 zoom-in-[0.98] motion-reduce:animate-none',
              )}
            >
              <DialogPrimitive.Title className="sr-only">Menu d’attaque</DialogPrimitive.Title>
              <TopBar
                ctx={ctx}
                flow={flow}
                stage={stage}
                actionCount={actionCount}
                onBack={back}
                onClose={close}
              />
              <VersusHeader
                ctx={ctx}
                attackerId={draft.attackerId}
                attackerName={model.sheet.name}
                portraitUrl={model.sheet.portraitUrl}
                fc={fc}
                targetIds={draft.targetIds}
                editable={composing}
                canAim={canAimNow}
                maxTargets={model.multi.max}
                onAttacker={(id) => attackMenu.dispatch({ type: 'setAttacker', attackerId: id })}
                onToggleTarget={(id) =>
                  attackMenu.dispatch({ type: 'toggleTarget', characterId: id })
                }
                onRemoveTarget={(id) =>
                  attackMenu.dispatch({ type: 'removeTarget', characterId: id })
                }
                onAim={aim}
                badges={standingBadge}
              />
              <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin]">
                <AnimatePresence mode="wait" initial={false} custom={direction}>
                  <motion.div
                    key={stage === 'end' ? 'roll' : stage}
                    custom={direction}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, x: 28 * direction }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, x: -20 * direction }}
                    transition={{ duration: reduced ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="px-4 py-5 sm:px-10 sm:py-8"
                  >
                    <StageBody
                      ctx={ctx}
                      flow={flow}
                      model={model}
                      stage={stage}
                      loading={loading}
                      attack={attack}
                      revealed={revealed}
                      instant={reduced || !attack || model.liveAttackId !== attack.id}
                      onRevealed={() => {
                        if (flow.phase === 'declared') setRevealedId(flow.attack.id);
                      }}
                    />
                  </motion.div>
                </AnimatePresence>
              </main>
              <Footer
                ctx={ctx}
                flow={flow}
                model={model}
                stage={stage}
                attack={attack}
                actionCount={actionCount}
                onBack={back}
                onClose={close}
              />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      {minimized && (
        <AimPill
          ctx={ctx}
          attackerId={draft.attackerId}
          attackerName={model.sheet.name}
          attackerPortrait={model.sheet.portraitUrl}
          targetIds={draft.targetIds}
          onDone={() => attackMenu.dispatch({ type: 'aim', on: false })}
        />
      )}
    </>
  );
}

// ─── Visée en direct ─────────────────────────────────────────────────────────

/** Attaquant et cibles partent aux MJ pendant la composition, `end` ensuite (§ 10.2). */
function useAimBroadcast(flow: OpenFlow) {
  const { send } = useCampaignEphemeral(flow.campaignId, [COMBAT_AIM_KIND], () => undefined);
  const sendRef = useRef(send);
  sendRef.current = send;
  const sender = useMemo(
    () => new AimSender((m) => sendRef.current(COMBAT_AIM_KIND, m, { gmOnly: true })),
    [],
  );
  const composing = flow.phase === 'compose';
  const attackerId = flow.draft.attackerId;
  const targetsKey = flow.draft.targetIds.join(',');
  useEffect(() => {
    if (composing) sender.update(aimMessage(attackerId, targetsKey ? targetsKey.split(',') : []));
    else sender.end();
  }, [sender, composing, attackerId, targetsKey]);
  useEffect(() => () => sender.end(), [sender]);
}

// ─── Barre du haut : round, étapes, « Mes attaques », fermer ─────────────────

function TopBar({
  ctx,
  flow,
  stage,
  actionCount,
  onBack,
  onClose,
}: {
  ctx: AttackContext;
  flow: OpenFlow;
  stage: MenuStage;
  actionCount: number;
  onBack: () => void;
  onClose: () => void;
}) {
  const [mine, setMine] = useState(false);
  const stages = visibleStages(actionCount);
  const current = stages.indexOf(stage);
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-muted-foreground">
        <Swords className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-semibold uppercase tracking-[0.14em] text-foreground">Attaque</span>
        <span aria-hidden>·</span>
        <span className="truncate">{ctx.combat ? `Round ${ctx.combat.round}` : 'Hors combat'}</span>
        {flow.queue.length > 0 && (
          <span className="hidden truncate lg:inline">
            · Ensuite : {flow.queue.map((id) => targetName(id, ctx.known)).join(', ')}
          </span>
        )}
      </div>

      <ol aria-label="Étapes" className="hidden items-center gap-1 md:flex">
        {stages.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const clickable = s === 'action' && stage === 'prepare' && canGoBack(stage, actionCount);
          const content = (
            <>
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full border text-[10px] font-bold tabular-nums',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : done
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-border-strong text-subtle',
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className={cn(active ? 'text-foreground' : 'text-muted-foreground')}>
                {MENU_STAGE_LABELS[s]}
              </span>
            </>
          );
          return (
            <li
              key={s}
              className="flex items-center gap-1"
              aria-current={active ? 'step' : undefined}
            >
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn('h-px w-5', done || active ? 'bg-primary/50' : 'bg-border-strong')}
                />
              )}
              {clickable ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[12px] font-medium transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  {content}
                </button>
              ) : (
                <span className="flex items-center gap-1.5 px-1.5 py-0.5 text-[12px] font-medium">
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-[12px] text-muted-foreground md:hidden" aria-live="polite">
        {current + 1}/{stages.length} · {MENU_STAGE_LABELS[stage]}
      </p>

      <div className="flex flex-1 items-center justify-end gap-1">
        <Popover open={mine} onOpenChange={setMine}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="max-sm:px-2">
              <History />
              <span className="hidden sm:inline">Mes attaques</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-[min(34rem,70dvh)] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto p-3 [scrollbar-width:thin]"
          >
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
              Mes attaques
            </p>
            <MyAttacks
              campaignId={flow.campaignId}
              combatId={ctx.combat?.id ?? null}
              userId={ctx.me.id}
              known={ctx.known}
              onShow={(a) => {
                setMine(false);
                if (flow.phase !== 'submitting') attackMenu.dispatch({ type: 'show', attack: a });
              }}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fermer le menu d’attaque"
          onClick={onClose}
          disabled={flow.phase === 'submitting'}
          className="max-sm:size-10"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

// ─── Corps de l'étape ────────────────────────────────────────────────────────

function StageBody({
  ctx,
  flow,
  model,
  stage,
  loading,
  attack,
  revealed,
  instant,
  onRevealed,
}: {
  ctx: AttackContext;
  flow: OpenFlow;
  model: AttackModel;
  stage: MenuStage;
  loading: boolean;
  attack: ReturnType<typeof useDeclaredAttack>;
  revealed: boolean;
  instant: boolean;
  onRevealed: () => void;
}) {
  const systeme = ctx.systeme;
  if (stage === 'roll' || stage === 'end')
    return systeme ? (
      <StepRoll
        attack={flow.phase === 'submitting' ? null : attack}
        ctx={ctx}
        systeme={systeme}
        presentation={ctx.presentation}
        instant={instant}
        revealed={revealed}
        onRevealed={onRevealed}
      />
    ) : null;
  if (loading)
    return (
      <p className="flex min-h-[16rem] items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Préparation du menu…
      </p>
    );
  if (!flow.draft.attackerId)
    return (
      <div className="mx-auto max-w-sm py-12 text-center">
        <UserRoundCog className="mx-auto mb-3 size-8 text-subtle" aria-hidden />
        <p className="font-medium">Qui attaque ?</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Choisissez l’attaquant à côté de son portrait, en haut à gauche.
        </p>
      </div>
    );
  if (!model.fiche || !systeme)
    return <Message>La fiche de ce personnage n’est pas disponible.</Message>;
  if (stage === 'action')
    return (
      <StepAction
        systeme={systeme}
        presentation={ctx.presentation}
        fiche={model.fiche}
        groups={model.groups}
        selected={model.action?.id ?? null}
        rememberedId={model.remembered?.id ?? null}
        onChoose={model.choose}
      />
    );
  if (!model.action)
    return (
      <p className="flex min-h-[12rem] items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Préparation de l’action…
      </p>
    );
  const draft = flow.draft;
  const busy = flow.phase !== 'compose';
  return (
    <StepPrepare
      ctx={ctx}
      systeme={systeme}
      presentation={ctx.presentation}
      fiche={model.fiche}
      action={model.action}
      groups={model.groups}
      values={draft.params}
      onParam={(id, value) => attackMenu.dispatch({ type: 'setParam', id, value })}
      attackerId={draft.attackerId}
      targetIds={draft.targetIds}
      preview={model.preview}
      adjustments={draft.adjustments}
      onAdjustment={(die, value) => attackMenu.dispatch({ type: 'setAdjustment', die, value })}
      onResetAdjustments={() => attackMenu.dispatch({ type: 'resetAdjustments' })}
      rollMode={model.rollMode}
      actionRollMode={model.multi.rollMode}
      onRollMode={(rollMode) => attackMenu.dispatch({ type: 'setRollMode', rollMode })}
      hidden={model.hidden}
      onHidden={(h) =>
        attackMenu.dispatch({ type: 'setVisibility', visibility: h ? 'gm' : 'public' })
      }
      canChangeAction={canGoBack('prepare', model.actions.length)}
      onChangeAction={() => attackMenu.dispatch({ type: 'setStep', step: 'action' })}
      disabled={busy}
    />
  );
}

// ─── Pied : l'action principale de l'étape ───────────────────────────────────

function Footer({
  ctx,
  flow,
  model,
  stage,
  attack,
  actionCount,
  onBack,
  onClose,
}: {
  ctx: AttackContext;
  flow: OpenFlow;
  model: AttackModel;
  stage: MenuStage;
  attack: ReturnType<typeof useDeclaredAttack>;
  actionCount: number;
  onBack: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<Parameters<typeof attackMenu.dispatch>[0]>) {
    setBusy(label);
    try {
      attackMenu.dispatch(await fn());
    } catch (err) {
      toast.error(combatErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (stage === 'action') {
    const resume = model.remembered;
    return (
      <Bar>
        <p className="hidden items-center gap-2 text-[12px] text-subtle sm:flex">
          <Kbd>1</Kbd>–<Kbd>9</Kbd> choisir une action
          {model.action && (
            <>
              <span aria-hidden>·</span> <Kbd>Entrée</Kbd> {model.action.nom}
            </>
          )}
        </p>
        {resume && flow.phase === 'compose' ? (
          <Button onClick={() => model.choose(resume)} className="ml-auto" variant="secondary">
            <History /> Reprendre : {resume.nom}
          </Button>
        ) : (
          <span />
        )}
      </Bar>
    );
  }

  if (stage === 'prepare') {
    const error = flow.phase === 'compose' ? flow.error : null;
    const retry = flow.phase === 'compose' && flow.retryKey;
    const n = flow.draft.targetIds.length;
    return (
      <Bar className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {error && (
          <div className="sm:order-2 sm:flex-1">
            <Message>{error}</Message>
          </div>
        )}
        <div className="flex items-center gap-2 sm:order-1">
          {canGoBack(stage, actionCount) && (
            <Button variant="ghost" onClick={onBack} disabled={model.busy}>
              <ArrowLeft /> Retour
            </Button>
          )}
          {model.disabledReason && !model.busy && (
            <p className="text-[12px] text-subtle sm:hidden">{model.disabledReason}</p>
          )}
        </div>
        <div className="flex items-center gap-3 sm:order-3 sm:ml-auto">
          {model.disabledReason && !model.busy && (
            <p className="hidden text-[12px] text-subtle sm:block">{model.disabledReason}</p>
          )}
          <Button
            size="xl"
            className="w-full min-w-[15rem] shadow-glow sm:w-auto"
            loading={model.busy}
            disabled={Boolean(model.disabledReason)}
            onClick={() => void model.submit()}
          >
            {!model.busy && <Swords />}
            {retry ? 'Réessayer' : 'Lancer l’attaque'}
            {n > 1 ? ` (${n} cibles)` : ''}
            {!model.busy && !model.disabledReason && (
              <Kbd className="ml-1 border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground max-sm:hidden">
                Entrée
              </Kbd>
            )}
          </Button>
        </div>
      </Bar>
    );
  }

  if (!attack)
    return (
      <Bar>
        <span />
      </Bar>
    );
  const s = declaredStage(attack);

  if (stage === 'roll' && (s === 'reactions' || s === 'dice')) {
    const waiting = awaitingReaction(attack);
    return (
      <Bar>
        {ctx.gm && s === 'reactions' && waiting.length > 0 ? (
          <Button
            variant="secondary"
            loading={busy === 'skip'}
            onClick={() =>
              void run('skip', async () => {
                let last = attack;
                for (const t of waiting)
                  last = await model.commands.react(attack.id, {
                    characterId: t.characterId,
                    skip: true,
                  });
                return { type: 'attackUpdated', attack: last };
              })
            }
          >
            <Shield /> Passer les défenses
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant="ghost"
          loading={busy === 'cancel'}
          onClick={() =>
            void run('cancel', async () => ({
              type: 'attackUpdated',
              attack: await model.commands.cancel(attack.id, { version: attack.version }),
            }))
          }
        >
          <Undo2 /> Abandonner
        </Button>
      </Bar>
    );
  }

  if (stage === 'roll')
    return (
      <Bar>
        <span />
      </Bar>
    );

  // Fin : statut du rapport, puis la suite
  return (
    <Bar className="flex-col items-stretch gap-3 lg:flex-row lg:items-center">
      <div className="lg:mr-auto">
        <ReportStatus attack={attack} gm={ctx.gm} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
        {flow.queue.length > 0 && (
          <Button
            className="col-span-2"
            onClick={() => attackMenu.dispatch({ type: 'nextAttacker' })}
          >
            <UserRoundCog /> Suivant : {targetName(flow.queue[0]!, ctx.known)}
            <ArrowRight />
          </Button>
        )}
        <Button
          variant={flow.queue.length ? 'secondary' : 'default'}
          onClick={() => attackMenu.dispatch({ type: 'again', keepTargets: true })}
        >
          <RotateCcw /> Mêmes cibles
        </Button>
        <Button
          variant="secondary"
          onClick={() => attackMenu.dispatch({ type: 'again', keepTargets: false })}
        >
          <Target /> Nouvelle attaque
        </Button>
        <Button variant="ghost" className="col-span-2 sm:col-span-1" onClick={onClose}>
          Terminer
        </Button>
      </div>
    </Bar>
  );
}

function Bar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer
      className={cn(
        'flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface/60 px-4 py-3 sm:px-8',
        className,
      )}
    >
      {children}
    </footer>
  );
}
