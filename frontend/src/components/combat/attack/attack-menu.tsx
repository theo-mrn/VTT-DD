'use client';

/**
 * Menu d'attaque (docs/combat.md § 12.1), repris de l'ancienne page d'attaque : plein écran
 * (portail, fond assombri ; fenêtre large centrée sur ordinateur, tout l'écran sur mobile), le
 * duel en tête, puis trois écrans au plus, une seule action principale chacun :
 *
 * 1. Composer : les cartes qui lancent (types d'attaque, ou l'arme et le pool) ; un clic = le jet.
 * 2. Jet : le résultat comme le lanceur de dés l'affiche, TOUCHÉ ou RATÉ ; si touché et que
 *    l'arme vient après le jet, l'écran des dégâts : un clic = les dégâts.
 * 3. Fin : le grand chiffre, le statut du rapport, « Nouvelle attaque », « Mêmes cibles ».
 *
 * L'état vit dans la machine `lib/combat/attack-flow.ts` (magasin de l'onglet) : la carte y
 * ajoute les cibles visées, la fiche et le panneau Combat l'ouvrent. « Viser sur la carte »
 * réduit la fenêtre à une pastille (`AimPill`) ; aucune clé de jeu : actions, paramètres, dés et
 * symboles viennent du système et de sa présentation.
 *
 * Clavier : 1 à 9 déclenchent les cartes numérotées de l'écran, Entrée relance le dernier type
 * (ou lance l'action, ou la suite), V vise sur la carte, Échap ferme.
 */
import { translate } from '@/i18n/runtime';
import { useTranslations } from 'next-intl';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { Valeur } from '@vtt/rules';
import {
  ArrowRight,
  Clock,
  History,
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
import type { ActionParams } from '@vtt/contracts';
import { EtatVide } from '@/components/commun/page';
import { Message } from '@/components/compte/elements';
import type { ContexteFiche } from '@/components/fiche/widgets';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { shortcutCode } from '@/lib/keyboard';
import { useCampaignEphemeral } from '@/lib/realtime';
import { AimSender, aimMessage, COMBAT_AIM_KIND } from '@/lib/combat/aim';
import { combatErrorMessage } from '@/lib/combat/api';
import { typeCardParam } from '@/lib/combat/params';
import {
  declaredStage,
  isMinimized,
  isQuickAim,
  menuStage,
  stepButtonLabel,
  stepToLaunch,
} from '@/lib/combat/attack-flow';
import { attackMenu, closeAttackMenu, useAttackFlow } from '@/lib/combat/attack-menu-store';
import { capacitesDeCombat, openCapacitiesMenu } from '@/lib/combat/capacities';
import { clientRunner } from '@/lib/combat/dice-steps';
import { isLocalAttack } from '@/lib/combat/local-attack';
import { awaitingReaction, targetName } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { AimPill } from './aim-pill';
import { LaunchButton } from './launch';
import { MyAttacks } from './my-attacks';
import { PreviewText } from './preview';
import { StepCompose } from './step-compose';
import { StepDamage } from './step-damage';
import { ReportStatus, StepRoll, useDeclaredAttack } from './step-roll';
import { useAttackContext, type AttackContext } from './use-attack-context';
import { useAttackModel, type AttackModel, type OpenFlow } from './use-attack-model';
import { VersusHeader } from './versus-header';

/** Menu d'attaque d'une campagne, s'il est ouvert pour elle. */
export function AttackMenu({
  campaignId,
  canAim,
}: Readonly<{
  campaignId: string;
  /** Une carte est affichée : « Viser sur la carte » y est possible. */
  canAim: boolean;
}>) {
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

/** Écran affiché : composer, le jet (et la fin), les dégâts. */
type Screen = 'compose' | 'roll' | 'damage';

function OpenMenu({ flow, canAim }: Readonly<{ flow: OpenFlow; canAim: boolean }>) {
  const t = useTranslations();
  const ctx = useAttackContext(flow.campaignId);
  const model = useAttackModel(flow, ctx);
  const attack = useDeclaredAttack(flow, model.commands);
  useAimBroadcast(flow);
  const reduced = useReducedMotion() ?? false;
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const draft = flow.draft;
  const composing = flow.phase === 'compose';
  const loading = menuLoading(ctx, model, draft.attackerId);
  // Le rapport d'une attaque calculée ici remplace l'attaque locale : déjà dévoilée
  const revealed = isRevealed(flow, revealedId);
  const stage =
    menuStage(flow, { actionCount: loading ? 2 : model.actions.length, revealed }) ?? 'action';
  const minimized = isMinimized(flow);
  const canAimNow = canAim && composing;
  const instant = reduced || !attack || model.liveAttackId !== attack.id;

  const nextStep = attack ? stepToLaunch(attack) : null;
  const { screen, damageStep } = screenOf(stage, nextStep, revealed || instant);
  // Écran des dégâts affichable : l'étape, la fiche et le système sont là
  const degatsPrets = Boolean(
    screen === 'damage' && attack && damageStep && ctx.systeme && model.fiche,
  );

  const close = () => attackMenu.dispatch({ type: 'close' });
  const aim = () => {
    if (canAimNow) attackMenu.dispatch({ type: 'aim', on: true });
  };
  const [launching, setLaunching] = useState(false);
  /**
   * Lance l'étape suivante. Une étape qui demande des paramètres (l'arme, une fois touché) les
   * reçoit ici ; les dés qu'ils impliquent partent aussitôt (un seul clic pour les dégâts).
   */
  const launchNext = async (params?: Record<string, Valeur>) => {
    if (!attack || !nextStep || launching) return;
    setLaunching(true);
    try {
      // Calculée dans le navigateur : la suite aussi, sans appel réseau jusqu'au rapport
      if (isLocalAttack(attack)) {
        await model.continueInBrowser(attack, params as ActionParams | undefined);
        return;
      }
      let updated = await model.commands.submitDice(attack.id, {
        ...(await clientRunner.run(nextStep)),
        ...(params ? { params: params as ActionParams } : {}),
      });
      const then = params ? stepToLaunch(updated) : null;
      if (then && then.phase === nextStep.phase && !then.params?.length)
        updated = await model.commands.submitDice(attack.id, await clientRunner.run(then));
      attackMenu.dispatch({ type: 'attackUpdated', attack: updated });
    } catch (err) {
      toast.error(combatErrorMessage(err));
    } finally {
      setLaunching(false);
    }
  };

  /** Dans un champ : ⌘/Ctrl+Entrée lance l'attaque en composition, le reste est à la saisie. */
  function onTypingKey(e: KeyboardEvent<HTMLDivElement>) {
    if (screen === 'compose' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void model.submit();
    }
  }

  /** 1 à 9 : les cartes numérotées de l'écran (types d'attaque, armes, actions). */
  function onDigitKey(e: KeyboardEvent<HTMLDivElement>, digit: string) {
    const card = contentRef.current?.querySelector<HTMLButtonElement>(
      `main [data-shortcut="${digit}"]:not(:disabled)`,
    );
    if (card) {
      e.preventDefault();
      card.click();
    }
  }

  /** Entrée : lance l'attaque, ou l'étape suivante qui n'attend pas de paramètres. */
  function onEnterKey(e: KeyboardEvent<HTMLDivElement>, target: HTMLElement) {
    const forced = e.metaKey || e.ctrlKey;
    if (!forced && target.closest(PRESSABLE)) return;
    if (screen === 'compose' && composing) {
      e.preventDefault();
      void model.submit();
    } else if (screen === 'roll' && nextStep && !nextStep.params?.length) {
      e.preventDefault();
      void launchNext();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.altKey || e.repeat) return;
    const target = e.target as HTMLElement;
    const mods = e.metaKey || e.ctrlKey || e.shiftKey;
    if (target.closest(TYPING)) {
      onTypingKey(e);
      return;
    }
    if (!mods && shortcutCode(e) === 'KeyV' && canAimNow && screen === 'compose') {
      e.preventDefault();
      aim();
      return;
    }
    const digit = !mods ? /^(?:Digit|Numpad)([1-9])$/.exec(e.code) : null;
    if (digit && (screen === 'compose' || screen === 'damage')) {
      onDigitKey(e, digit[1]!);
      return;
    }
    if (e.key === 'Enter') onEnterKey(e, target);
  }

  const fc = ficheContext(ctx, model, draft.attackerId);
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
              'fixed inset-0 z-50 bg-black/80',
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
                'sm:h-[min(50rem,calc(100dvh-2rem))] sm:max-w-[76rem] sm:rounded-2xl sm:border sm:border-border-strong sm:py-0 sm:shadow-elevated',
                'duration-200 animate-in fade-in-0 zoom-in-[0.98] motion-reduce:animate-none',
              )}
            >
              <DialogPrimitive.Title className="sr-only">
                {t('combat.attack.title')}
              </DialogPrimitive.Title>
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
                promptAttacker={
                  flow.phase === 'compose' && !flow.autoAttacker && !draft.attackerId && !loading
                }
                bar={<TopBar ctx={ctx} flow={flow} model={model} onClose={close} />}
              />
              <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={screen}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      transition: { duration: reduced ? 0.12 : 0.24, ease: [0.22, 1, 0.36, 1] },
                    }}
                    exit={
                      reduced
                        ? { opacity: 0, transition: { duration: 0.08 } }
                        : {
                            opacity: 0,
                            x: -16,
                            transition: { duration: 0.14, ease: [0.4, 0, 1, 1] },
                          }
                    }
                    className="px-4 py-5 sm:px-10 sm:py-8"
                  >
                    <ScreenContent
                      screen={screen}
                      ctx={ctx}
                      flow={flow}
                      model={model}
                      loading={loading}
                      canAim={canAimNow}
                      onAim={aim}
                      damage={degatsPrets ? damageStep : null}
                      attack={attack}
                      launching={launching}
                      onLaunch={(params) => void launchNext(params)}
                      instant={instant}
                      revealed={revealed}
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
                screen={screen}
                attack={attack}
                onClose={close}
                onLaunchNext={() => void launchNext()}
                launching={launching}
              />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      {minimized && (
        <AimPill
          campaignId={flow.campaignId}
          ctx={ctx}
          attackerId={draft.attackerId}
          attackerName={model.sheet.name}
          attackerPortrait={model.sheet.portraitUrl}
          targetIds={draft.targetIds}
          quick={isQuickAim(flow)}
          onDone={() => attackMenu.dispatch({ type: 'aim', on: false })}
          onCancel={() => attackMenu.dispatch({ type: 'aimCancel' })}
        />
      )}
    </>
  );
}

type LaunchStep = ReturnType<typeof stepToLaunch>;
type Stage = NonNullable<ReturnType<typeof menuStage>>;

/** Contexte, système ou fiche de l'attaquant encore en chargement. */
function menuLoading(ctx: AttackContext, model: AttackModel, attackerId: string | null): boolean {
  return ctx.loading || !ctx.systeme || (Boolean(attackerId) && model.sheet.loading);
}

/** Résultat déjà dévoilé : celui de l'attaque, ou de l'attaque locale qu'elle remplace. */
function isRevealed(flow: OpenFlow, revealedId: string | null): boolean {
  return (
    flow.phase === 'declared' &&
    revealedId !== null &&
    (revealedId === flow.attack.id || revealedId === flow.previousId)
  );
}

/** Écran à montrer, et l'étape des dégâts à paramétrer une fois le jet montré. */
function screenOf(
  stage: Stage,
  nextStep: LaunchStep,
  shown: boolean,
): { screen: Screen; damageStep: LaunchStep } {
  const damageStep = stage === 'roll' && nextStep?.params?.length && shown ? nextStep : null;
  if (stage === 'action' || stage === 'prepare') return { screen: 'compose', damageStep };
  return { screen: damageStep ? 'damage' : 'roll', damageStep };
}

/** Contexte de fiche de l'attaquant (en-tête), dès que sa fiche et le système sont là. */
function ficheContext(
  ctx: AttackContext,
  model: AttackModel,
  attackerId: string | null,
): ContexteFiche | null {
  if (!model.fiche || !ctx.systeme || !attackerId) return null;
  return {
    systeme: ctx.systeme,
    presentation: ctx.presentation,
    fiche: model.fiche,
    personnage: {
      id: attackerId,
      name:
        model.sheet.name ?? ctx.known.get(attackerId)?.name ?? translate('map.common.character'),
      roomId: ctx.campagne?.id ?? null,
    },
    mj: ctx.gm,
  };
}

/** Contenu de l'écran : composition, dégâts à paramétrer, ou le jet et son résultat. */
function ScreenContent({
  screen,
  ctx,
  flow,
  model,
  loading,
  canAim,
  onAim,
  damage,
  attack,
  launching,
  onLaunch,
  instant,
  revealed,
  onRevealed,
}: Readonly<{
  screen: Screen;
  ctx: AttackContext;
  flow: OpenFlow;
  model: AttackModel;
  loading: boolean;
  canAim: boolean;
  onAim(): void;
  /** Étape des dégâts, quand son écran est affichable. */
  damage: LaunchStep;
  attack: ReturnType<typeof useDeclaredAttack>;
  launching: boolean;
  onLaunch(params: Record<string, Valeur>): void;
  instant: boolean;
  revealed: boolean;
  onRevealed(): void;
}>) {
  return (
    <>
      {screen === 'compose' && (
        <ComposeBody
          ctx={ctx}
          flow={flow}
          model={model}
          loading={loading}
          canAim={canAim}
          onAim={onAim}
        />
      )}
      {damage && attack && ctx.systeme && model.fiche && (
        <StepDamage
          key={damage.id}
          attack={attack}
          stepParams={damage.params ?? []}
          ctx={ctx}
          systeme={ctx.systeme}
          presentation={ctx.presentation}
          fiche={model.fiche}
          launching={launching}
          onLaunch={onLaunch}
        />
      )}
      {screen !== 'compose' && !damage && ctx.systeme && (
        <StepRoll
          attack={flow.phase === 'submitting' ? null : attack}
          ctx={ctx}
          systeme={ctx.systeme}
          presentation={ctx.presentation}
          instant={instant}
          revealed={revealed}
          onRevealed={onRevealed}
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

// ─── Barre du haut : round, tour, « Mes attaques », fermer ───────────────────

function TopBar({
  ctx,
  flow,
  model,
  onClose,
}: Readonly<{
  ctx: AttackContext;
  flow: OpenFlow;
  model: AttackModel;
  onClose: () => void;
}>) {
  const t = useTranslations();
  const [mine, setMine] = useState(false);
  const standing =
    flow.draft.attackerId && model.standing !== 'free' && flow.phase !== 'declared'
      ? model.standing
      : null;
  return (
    <div className="flex items-center gap-2 px-3 pt-2 sm:px-5 sm:pt-3">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
        <span className="shrink-0 font-medium text-muted-foreground">
          {t('combat.attack.title')}
        </span>
        <span aria-hidden className="text-subtle">
          ·
        </span>
        <span className="truncate text-subtle">
          {ctx.combat
            ? t('combat.attack.round', { round: ctx.combat.round })
            : t('combat.attack.outsideCombat')}
        </span>
        {standing === 'on_turn' && (
          <Badge ton="primaire" className="ml-1">
            <Swords aria-hidden /> {t('combat.attack.theirTurn')}
          </Badge>
        )}
        {standing === 'out_of_turn' && (
          <Badge ton={model.blocked ? 'danger' : 'alerte'} className="ml-1">
            <Clock aria-hidden />{' '}
            {model.blocked ? t('combat.attack.notTheirTurn') : t('combat.attack.outOfTurnCap')}
          </Badge>
        )}
        {flow.queue.length > 0 && (
          <span className="ml-1 hidden truncate text-subtle lg:inline">
            ·{' '}
            {t('combat.attack.next', {
              names: flow.queue.map((id) => targetName(id, ctx.known)).join(', '),
            })}
          </span>
        )}
      </div>
      <Popover open={mine} onOpenChange={setMine}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="max-sm:size-10 max-sm:px-0">
            <History />
            <span className="max-sm:sr-only">{t('combat.attack.myAttacks')}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="max-h-[min(34rem,70dvh)] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto p-3 [scrollbar-width:thin]"
        >
          <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-subtle">
            {t('combat.attack.myAttacks')}
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
        aria-label={t('common.actions.close')}
        onClick={onClose}
        disabled={flow.phase === 'submitting'}
        className="max-sm:size-10"
      >
        <X />
      </Button>
    </div>
  );
}

// ─── Écran 1 ─────────────────────────────────────────────────────────────────

function ComposeBody({
  ctx,
  flow,
  model,
  loading,
  canAim,
  onAim,
}: Readonly<{
  ctx: AttackContext;
  flow: OpenFlow;
  model: AttackModel;
  loading: boolean;
  canAim: boolean;
  onAim: () => void;
}>) {
  const t = useTranslations();
  if (loading)
    return (
      <div
        aria-busy
        aria-label={t('history.loading')}
        className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[9.5rem] rounded-2xl sm:h-[13rem]" />
        ))}
      </div>
    );
  if (!flow.draft.attackerId)
    return (
      <EtatVide icone={UserRoundCog} titre="Qui attaque ?" className="mx-auto max-w-md py-10" />
    );
  if (!model.fiche || !ctx.systeme) return <Message>{t('combat.attack.sheetUnavailable')}</Message>;
  // Capacités sans action à elles (les autres sont déjà des onglets) : le menu Capacités
  const attaquant = flow.draft.attackerId;
  const capacites = capacitesDeCombat(ctx.systeme, ctx.presentation, model.fiche).some(
    (c) => c.jeu.type !== 'actions',
  );
  return (
    <StepCompose
      ctx={ctx}
      model={model}
      draft={flow.draft}
      error={flow.phase === 'compose' ? flow.error : null}
      canAim={canAim}
      onAim={onAim}
      onCapacities={
        capacites
          ? () => {
              closeAttackMenu();
              openCapacitiesMenu({
                campaignId: flow.campaignId,
                actorId: attaquant,
                origin: flow.origin,
              });
            }
          : undefined
      }
    />
  );
}

// ─── Pied : l'action principale de l'écran ───────────────────────────────────

function Footer({
  ctx,
  flow,
  model,
  stage,
  screen,
  attack,
  onClose,
  onLaunchNext,
  launching,
}: Readonly<{
  ctx: AttackContext;
  flow: OpenFlow;
  model: AttackModel;
  stage: ReturnType<typeof menuStage>;
  screen: Screen;
  attack: ReturnType<typeof useDeclaredAttack>;
  onClose: () => void;
  /** Lance l'étape suivante (dégâts après TOUCHÉ, table). */
  onLaunchNext: () => void;
  launching: boolean;
}>) {
  const t = useTranslations();
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

  if (screen === 'compose') return <ComposeBar ctx={ctx} flow={flow} model={model} />;

  if (!attack) return null;
  const s = declaredStage(attack);
  const abandon = (
    <Button
      variant="ghost"
      loading={busy === 'cancel'}
      disabled={launching}
      onClick={() =>
        isLocalAttack(attack)
          ? model.cancelInBrowser(attack)
          : void run('cancel', async () => ({
              type: 'attackUpdated',
              attack: await model.commands.cancel(attack.id, { version: attack.version }),
            }))
      }
    >
      <Undo2 /> {t('combat.attack.abandonShort')}
    </Button>
  );

  if (stage === 'roll' && (s === 'reactions' || s === 'dice'))
    return (
      <Bar>
        {abandon}
        {ctx.gm && s === 'reactions' && (
          <SkipDefences attack={attack} model={model} busy={busy} run={run} />
        )}
      </Bar>
    );

  const next = stepToLaunch(attack);
  // Écran des dégâts : chaque carte lance ; il ne reste qu'à abandonner
  if (screen === 'damage') return <Bar>{abandon}</Bar>;
  if (stage === 'roll' && s === 'next' && next && !next.params?.length)
    return (
      <Bar>
        {abandon}
        <LaunchButton
          size="lg"
          enter
          busy={launching}
          disabled={busy !== null}
          onClick={onLaunchNext}
        >
          {stepButtonLabel(next)}
        </LaunchButton>
      </Bar>
    );
  if (stage !== 'end') return null;

  // Fin : statut du rapport, puis la suite
  return <EndBar ctx={ctx} flow={flow} attack={attack} onClose={onClose} />;
}

type Run = (
  label: string,
  fn: () => Promise<Parameters<typeof attackMenu.dispatch>[0]>,
) => Promise<void>;

/** Composition : « Lancer l'attaque », sauf quand les cartes du type d'attaque lancent seules. */
function ComposeBar({
  ctx,
  flow,
  model,
}: Readonly<{ ctx: AttackContext; flow: OpenFlow; model: AttackModel }>) {
  const t = useTranslations();
  // Cartes du type d'attaque : chacune lance, pas de bouton en plus
  const cards =
    model.action && model.systeme && model.fiche
      ? typeCardParam(model.systeme, model.action, model.fiche)
      : null;
  if (!model.action || cards || !flow.draft.attackerId) return null;
  const retry = flow.phase === 'compose' && flow.retryKey;
  const n = flow.draft.targetIds.length;
  return (
    <Bar className="justify-end">
      <LaunchButton
        size="lg"
        enter
        busy={model.busy}
        disabled={Boolean(model.disabledReason)}
        onClick={() => void model.submit()}
        className="w-full sm:w-auto sm:min-w-[16rem]"
      >
        {retry ? t('common.actions.retry') : t('combat.attack.launch')}
        {n > 1 && <span className="normal-case tracking-normal opacity-80">· {n} cibles</span>}
        {model.preview && (
          <span className="max-w-[12rem] truncate normal-case tracking-normal opacity-90">
            <PreviewText preview={model.preview} presentation={ctx.presentation} compact />
          </span>
        )}
      </LaunchButton>
    </Bar>
  );
}

/** Le MJ passe la défense des cibles qui n'ont pas encore répondu. */
function SkipDefences({
  attack,
  model,
  busy,
  run,
}: Readonly<{
  attack: NonNullable<ReturnType<typeof useDeclaredAttack>>;
  model: AttackModel;
  busy: string | null;
  run: Run;
}>) {
  const t = useTranslations();
  const waiting = awaitingReaction(attack);
  if (waiting.length === 0) return null;
  return (
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
      <Shield /> {t('combat.attack.skipDefenses')}
    </Button>
  );
}

/** Fin : statut du rapport, puis terminer, nouvelle attaque, mêmes cibles ou attaquant suivant. */
function EndBar({
  ctx,
  flow,
  attack,
  onClose,
}: Readonly<{
  ctx: AttackContext;
  flow: OpenFlow;
  attack: NonNullable<ReturnType<typeof useDeclaredAttack>>;
  onClose: () => void;
}>) {
  const t = useTranslations();
  return (
    <Bar className="flex-col items-stretch gap-3 lg:flex-row lg:items-center">
      <div className="lg:mr-auto">
        <ReportStatus attack={attack} gm={ctx.gm} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
        <Button variant="ghost" className="max-sm:order-last max-sm:col-span-2" onClick={onClose}>
          {t('combat.attack.finish')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => attackMenu.dispatch({ type: 'again', keepTargets: false })}
        >
          <Target /> {t('combat.attack.new')}
        </Button>
        <Button
          variant={flow.queue.length ? 'secondary' : 'default'}
          onClick={() => attackMenu.dispatch({ type: 'again', keepTargets: true })}
        >
          <RotateCcw /> {t('combat.attack.sameTargets')}
        </Button>
        {flow.queue.length > 0 && (
          <Button
            className="col-span-2"
            onClick={() => attackMenu.dispatch({ type: 'nextAttacker' })}
          >
            <UserRoundCog /> Suivant : {targetName(flow.queue[0]!, ctx.known)}
            <ArrowRight />
          </Button>
        )}
      </div>
    </Bar>
  );
}

function Bar({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <footer
      className={cn(
        'flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card/60 px-4 py-3 sm:px-8',
        className,
      )}
    >
      {children}
    </footer>
  );
}
