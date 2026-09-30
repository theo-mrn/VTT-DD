'use client';

/**
 * Menu d'attaque (docs/combat.md § 12.1) : panneau non modal, la carte reste visible et
 * cliquable pour viser. Une seule vue, de haut en bas : attaquant, action, paramètres, cibles,
 * options du jet, aperçu, « Attaquer » ; puis le suivi de l'attaque (défense de la cible, dés,
 * résultat par cible, décision du MJ en direct), et « Mes attaques ».
 *
 * L'état vit dans la machine `lib/combat/attack-flow.ts` (magasin de l'onglet) : la carte y
 * ajoute les cibles visées, la fiche et le panneau Combat l'ouvrent. Joueur et MJ (qui attaque
 * avec un PNJ comme un joueur) ; aucune clé de jeu : actions, paramètres, dés et symboles
 * viennent du système et de sa présentation.
 */
import type { Attack } from '@vtt/contracts';
import type { Action } from '@vtt/rules';
import { Loader2, RotateCcw, Shield, Swords, Target, Undo2, UserRoundCog, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
import { MapPanel } from '@/components/map/map-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDicePreferences } from '@/lib/dice-preferences';
import { useCampaignEphemeral } from '@/lib/realtime';
import { AimSender, aimMessage, COMBAT_AIM_KIND } from '@/lib/combat/aim';
import {
  groupActions,
  hasSuccessRule,
  multitargetOf,
  previewRoll,
  targetedActions,
} from '@/lib/combat/actions';
import { combatErrorMessage, isRetryable, newIdempotencyKey } from '@/lib/combat/api';
import {
  blockedByTurn,
  canSubmit,
  declareBody,
  declaredStage,
  defaultAttacker,
  effectiveRollMode,
  effectiveVisibility,
  submitKey,
  turnStanding,
  type AttackFlowState,
  type DeclaredState,
} from '@/lib/combat/attack-flow';
import { attackMenu, useAttackFlow } from '@/lib/combat/attack-menu-store';
import { chooseDiceMode, serverRunner } from '@/lib/combat/dice-steps';
import { mergeParams, missingParams, paramsToSend } from '@/lib/combat/params';
import { ATTACK_STATUS_LABELS, useAttack, useAttackCommands } from '@/lib/combat/use-attacks';
import { combatSettings, currentActorId } from '@/lib/combat/use-combat';
import { awaitingReaction, targetName } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { ActionPicker } from './action-picker';
import { AttackerHeader } from './attacker-header';
import { MyAttacks } from './my-attacks';
import { ParamsForm } from './params-form';
import { ResultCard } from './result-card';
import { RollOptions, RollPreviewLine } from './roll-options';
import { TargetsSection } from './targets';
import { useAttackContext, useComputedSheet, type AttackContext } from './use-attack-context';

type OpenFlow = Exclude<AttackFlowState, { phase: 'closed' }>;

/** Menu d'attaque d'une campagne, s'il est ouvert pour elle. */
export function AttackMenu({
  campaignId,
  canAim,
  className,
}: {
  campaignId: string;
  /** Une carte est affichée : l'outil de visée y est disponible. */
  canAim: boolean;
  className?: string;
}) {
  const flow = useAttackFlow((f) => f);
  if (flow.phase === 'closed' || flow.campaignId !== campaignId) return null;
  return <OpenMenu flow={flow} canAim={canAim} className={className} />;
}

function OpenMenu({
  flow,
  canAim,
  className,
}: {
  flow: OpenFlow;
  canAim: boolean;
  className?: string | undefined;
}) {
  const ctx = useAttackContext(flow.campaignId);
  const [tab, setTab] = useState<'attack' | 'mine'>('attack');
  useAimBroadcast(flow, ctx.gm);

  const close = () => attackMenu.dispatch({ type: 'close' });
  const round = ctx.combat ? `Round ${ctx.combat.round}` : 'Hors combat';
  return (
    <MapPanel
      id="attack-menu"
      label="Menu d’attaque"
      icon={Swords}
      title="Attaquer"
      subtitle={round}
      closeLabel="Fermer le menu d’attaque"
      onClose={close}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || flow.phase === 'submitting') return;
        e.stopPropagation();
        if (flow.phase === 'compose' && flow.aiming)
          attackMenu.dispatch({ type: 'aim', on: false });
        else close();
      }}
      className={cn('w-[24rem]', className)}
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'attack' | 'mine')}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="border-b border-border px-4 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="attack" className="flex-1">
              <Target aria-hidden /> Attaque
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex-1">
              <Swords aria-hidden /> Mes attaques
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="attack" className="mt-0 flex min-h-0 flex-1 flex-col">
          {ctx.loading || !ctx.systeme ? (
            <p className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Préparation du menu…
            </p>
          ) : flow.phase === 'declared' ? (
            <Tracking flow={flow} ctx={ctx} />
          ) : (
            <Compose flow={flow} ctx={ctx} canAim={canAim} />
          )}
        </TabsContent>
        <TabsContent value="mine" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
          <MyAttacks
            campaignId={flow.campaignId}
            combatId={ctx.combat?.id ?? null}
            userId={ctx.me.id}
            known={ctx.known}
            onShow={(attack) => {
              attackMenu.dispatch({ type: 'show', attack });
              setTab('attack');
            }}
          />
        </TabsContent>
      </Tabs>
    </MapPanel>
  );
}

// ─── Visée en direct ─────────────────────────────────────────────────────────

/** Attaquant et cibles partent aux MJ pendant la composition, `end` ensuite (§ 10.2). */
function useAimBroadcast(flow: OpenFlow, gm: boolean) {
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
    // Le MJ voit déjà sa propre visée ; un autre MJ la reçoit aussi
    if (composing) sender.update(aimMessage(attackerId, targetsKey ? targetsKey.split(',') : []));
    else sender.end();
  }, [sender, composing, attackerId, targetsKey, gm]);
  useEffect(() => () => sender.end(), [sender]);
}

// ─── Composition ─────────────────────────────────────────────────────────────

function Compose({
  flow,
  ctx,
  canAim,
}: {
  flow: Extract<OpenFlow, { phase: 'compose' | 'submitting' }>;
  ctx: AttackContext;
  canAim: boolean;
}) {
  const systeme = ctx.systeme!;
  const draft = flow.draft;
  const busy = flow.phase === 'submitting';
  const sheet = useComputedSheet(ctx, draft.attackerId);
  const fiche = sheet.fiche;
  const actorId = currentActorId(ctx.combat);
  const settings = combatSettings(ctx.combat);
  const prefs = useDicePreferences();
  const commands = useAttackCommands(flow.campaignId);

  // Attaquant par défaut à l'ouverture (mon personnage ; MJ : le PNJ qui agit)
  const autoAttacker = flow.phase === 'compose' && flow.autoAttacker;
  useEffect(() => {
    if (!autoAttacker || ctx.loading) return;
    const id = defaultAttacker({
      candidates: ctx.attackers.map((a) => a.id),
      gm: ctx.gm,
      heroId: ctx.heroId,
      currentActorId: actorId,
      sideOf: (c) => ctx.known.get(c)?.side ?? null,
    });
    attackMenu.dispatch({ type: 'setAttacker', attackerId: id });
  }, [autoAttacker, ctx.loading, ctx.attackers, ctx.gm, ctx.heroId, ctx.known, actorId]);

  const actions = useMemo(() => (fiche ? targetedActions(systeme, fiche) : []), [systeme, fiche]);
  const groups = useMemo(
    () => groupActions(actions, ctx.presentation),
    [actions, ctx.presentation],
  );
  const action = actions.find((a) => a.id === draft.actionId) ?? null;

  // Action indisponible pour cet attaquant (ou aucune) : la première proposée ; paramètres
  // gardés s'ils restent valides (PNJ suivant, changement d'attaquant)
  useEffect(() => {
    if (!fiche || busy) return;
    const target = action ?? groups[0]?.actions[0] ?? null;
    if (!target) {
      if (draft.actionId) attackMenu.dispatch({ type: 'setAction', actionId: null });
      return;
    }
    const params = mergeParams(systeme, target, fiche, draft.params);
    if (target.id !== draft.actionId)
      attackMenu.dispatch({ type: 'setAction', actionId: target.id, params });
    else if (!sameParams(params, draft.params)) attackMenu.dispatch({ type: 'setParams', params });
  }, [fiche, busy, action, groups, systeme, draft.actionId, draft.params]);

  const multi = multitargetOf(action);
  const standing = turnStanding(ctx.combat, draft.attackerId, actorId);
  const blocked = blockedByTurn(standing, ctx.gm, settings);
  const missing = action && fiche ? missingParams(systeme, action, fiche, draft.params) : [];
  const check = canSubmit(flow, { maxTargets: multi.max });
  const preview = action && fiche ? previewRoll(systeme, action, fiche, draft.params) : null;
  const hidden = effectiveVisibility(draft, { gm: ctx.gm, settings }) === 'gm';

  const selectAction = (a: Action) => {
    if (!fiche || a.id === draft.actionId) return;
    attackMenu.dispatch({
      type: 'setAction',
      actionId: a.id,
      params: mergeParams(systeme, a, fiche, draft.params),
    });
  };

  async function submit() {
    if (flow.phase !== 'compose' || !action || !check.ok || blocked || missing.length) return;
    const key = submitKey(flow, newIdempotencyKey);
    const body = declareBody(flow, {
      gm: ctx.gm,
      settings,
      params: paramsToSend(systeme, action, fiche, draft.params),
      actionDefaultRollMode: multi.rollMode,
      dice: chooseDiceMode({
        physicalAllowed: settings.physicalDice,
        animation3d: prefs.data?.animation3d ?? true,
      }),
    });
    attackMenu.dispatch({ type: 'submit', key });
    try {
      const attack = await commands.declare(body, key);
      attackMenu.dispatch({ type: 'declared', attack });
    } catch (err) {
      attackMenu.dispatch({
        type: 'rejected',
        message: combatErrorMessage(err),
        retryable: isRetryable(err),
      });
    }
  }

  const disabledReason = blocked
    ? 'Pas le tour de votre personnage'
    : !check.ok
      ? check.message
      : missing.length
        ? `${missing[0]!.nom} : aucune disponible`
        : null;

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
        <AttackerHeader
          ctx={ctx}
          attackerId={draft.attackerId}
          fiche={fiche}
          name={sheet.name}
          portraitUrl={sheet.portraitUrl}
          standing={standing}
          blocked={blocked}
          disabled={busy}
          onChange={(id) => attackMenu.dispatch({ type: 'setAttacker', attackerId: id })}
        />
        {flow.queue.length > 0 && (
          <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <UserRoundCog className="size-4" aria-hidden />
            Ensuite : {flow.queue.map((id) => targetName(id, ctx.known)).join(', ')}
          </p>
        )}

        {!draft.attackerId ? (
          <p className="text-[13px] text-muted-foreground">Choisissez d’abord qui attaque.</p>
        ) : sheet.loading || !fiche ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Lecture de la fiche…
          </p>
        ) : (
          <>
            <ActionPicker
              groups={groups}
              selected={draft.actionId}
              onSelect={selectAction}
              disabled={busy}
            />
            {action && (
              <ParamsForm
                systeme={systeme}
                action={action}
                fiche={fiche}
                values={draft.params}
                onChange={(id, value) => attackMenu.dispatch({ type: 'setParam', id, value })}
                compact
              />
            )}
          </>
        )}

        <TargetsSection
          ctx={ctx}
          attackerId={draft.attackerId}
          targetIds={draft.targetIds}
          max={multi.max}
          aiming={flow.phase === 'compose' && flow.aiming}
          canAim={canAim}
          disabled={busy}
          onToggle={(id) => attackMenu.dispatch({ type: 'toggleTarget', characterId: id })}
          onRemove={(id) => attackMenu.dispatch({ type: 'removeTarget', characterId: id })}
          onAim={(on) => attackMenu.dispatch({ type: 'aim', on })}
        />

        {action && (
          <RollOptions
            systeme={systeme}
            presentation={ctx.presentation}
            action={action}
            targetCount={draft.targetIds.length}
            rollMode={effectiveRollMode(draft, multi.rollMode)}
            actionRollMode={multi.rollMode}
            onRollMode={(rollMode) => attackMenu.dispatch({ type: 'setRollMode', rollMode })}
            gm={ctx.gm}
            hidden={hidden}
            onHidden={(h) =>
              attackMenu.dispatch({ type: 'setVisibility', visibility: h ? 'gm' : 'public' })
            }
            adjustments={draft.adjustments}
            onAdjustment={(die, value) =>
              attackMenu.dispatch({ type: 'setAdjustment', die, value })
            }
            onResetAdjustments={() => attackMenu.dispatch({ type: 'resetAdjustments' })}
            disabled={busy}
          />
        )}
        <RollPreviewLine preview={preview} presentation={ctx.presentation} />
      </div>

      <footer className="space-y-2 border-t border-border px-4 py-3">
        {flow.phase === 'compose' && flow.error && <Message>{flow.error}</Message>}
        <Button
          size="lg"
          className="w-full"
          loading={busy}
          disabled={Boolean(disabledReason)}
          onClick={() => void submit()}
        >
          {!busy && <Swords />}
          {flow.phase === 'compose' && flow.retryKey ? 'Réessayer' : 'Attaquer'}
          {draft.targetIds.length > 1 ? ` (${draft.targetIds.length} cibles)` : ''}
        </Button>
        {disabledReason && !busy && (
          <p className="text-center text-[12px] text-subtle">{disabledReason}</p>
        )}
      </footer>
    </>
  );
}

function sameParams(a: Record<string, unknown>, b: Record<string, unknown>) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

// ─── Suivi de l'attaque déclarée ─────────────────────────────────────────────

function Tracking({ flow, ctx }: { flow: DeclaredState; ctx: AttackContext }) {
  const systeme = ctx.systeme!;
  const commands = useAttackCommands(flow.campaignId);
  const live = useAttack(flow.campaignId, flow.attack.id);
  const attack =
    live.attack && live.attack.version >= flow.attack.version ? live.attack : flow.attack;
  const [busy, setBusy] = useState<string | null>(null);

  // Direct : la machine suit la dernière version (« Mêmes cibles » part de là)
  useEffect(() => {
    if (live.attack && live.attack.version > flow.attack.version)
      attackMenu.dispatch({ type: 'attackUpdated', attack: live.attack });
  }, [live.attack, flow.attack.version]);

  // Dés à lancer (étape C à venir) : le serveur tire, rien n'est animé
  const sent = useRef(new Set<string>());
  useEffect(() => {
    if (attack.status !== 'awaiting_dice') return;
    for (const step of attack.pendingSteps) {
      if (sent.current.has(step.id)) continue;
      sent.current.add(step.id);
      void serverRunner
        .run(step)
        .then((body) => commands.submitDice(attack.id, body))
        .catch((err) => toast.error(combatErrorMessage(err)));
    }
  }, [attack, commands]);

  const stage = declaredStage(attack);
  const action = systeme.actions.get(attack.action.id) ?? null;
  const successRule = hasSuccessRule(action);
  const waiting = awaitingReaction(attack);

  async function run(label: string, fn: () => Promise<Attack>) {
    setBusy(label);
    try {
      attackMenu.dispatch({ type: 'attackUpdated', attack: await fn() });
    } catch (err) {
      toast.error(combatErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const cancel = () => run('cancel', () => commands.cancel(attack.id, { version: attack.version }));
  const skipReactions = () =>
    run('skip', async () => {
      let last = attack;
      for (const t of waiting)
        last = await commands.react(attack.id, { characterId: t.characterId, skip: true });
      return last;
    });

  return (
    <>
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 [scrollbar-width:thin]"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold leading-tight">
              {attack.action.name}
            </p>
            <p className="truncate text-[13px] text-muted-foreground">
              {targetName(attack.attackerId, ctx.known)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {attack.outOfTurn && <Badge ton="alerte">hors tour</Badge>}
            {attack.selfTarget && <Badge ton="alerte">auto-attaque</Badge>}
            {attack.visibility === 'gm' && <Badge>caché</Badge>}
          </div>
        </div>

        {stage === 'reactions' && (
          <StageNote icon={<Shield className="size-4" aria-hidden />}>
            En attente de la défense de{' '}
            {waiting.map((t) => targetName(t.characterId, ctx.known)).join(', ') || 'la cible'}…
          </StageNote>
        )}
        {stage === 'dice' && (
          <StageNote icon={<Loader2 className="size-4 animate-spin" aria-hidden />}>
            Le serveur lance les dés…
          </StageNote>
        )}
        {stage === 'cancelled' && <Message ton="info">Attaque abandonnée.</Message>}
        {stage === 'failed' && (
          <Message>
            Refusée par les règles
            {attack.targets.find((t) => t.error)?.error
              ? ` : ${attack.targets.find((t) => t.error)!.error}`
              : '.'}
          </Message>
        )}

        {(stage === 'result' || stage === 'failed') && (
          <>
            <ul className="space-y-2">
              {attack.targets.map((t) => (
                <ResultCard
                  key={t.characterId}
                  attack={attack}
                  target={t}
                  known={ctx.known}
                  systeme={systeme}
                  presentation={ctx.presentation}
                  successRule={successRule}
                />
              ))}
            </ul>
            <p className="text-center text-[12px] text-subtle">
              {attack.status === 'pending'
                ? ctx.gm
                  ? 'Rapport en attente : décidez dans le panneau Combat.'
                  : 'Rapport envoyé au MJ.'
                : ATTACK_STATUS_LABELS[attack.status]}
            </p>
          </>
        )}
      </div>

      <footer className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
        {stage === 'reactions' || stage === 'dice' ? (
          <>
            {ctx.gm && stage === 'reactions' && waiting.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                loading={busy === 'skip'}
                onClick={() => void skipReactions()}
              >
                <Shield /> Passer les défenses
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              loading={busy === 'cancel'}
              onClick={() => void cancel()}
            >
              <Undo2 /> Abandonner
            </Button>
          </>
        ) : (
          <>
            {flow.queue.length > 0 && (
              <Button size="sm" onClick={() => attackMenu.dispatch({ type: 'nextAttacker' })}>
                <UserRoundCog /> Suivant : {targetName(flow.queue[0]!, ctx.known)}
              </Button>
            )}
            <Button
              variant={flow.queue.length ? 'secondary' : 'default'}
              size="sm"
              onClick={() => attackMenu.dispatch({ type: 'again', keepTargets: true })}
            >
              <RotateCcw /> Mêmes cibles
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => attackMenu.dispatch({ type: 'again', keepTargets: false })}
            >
              <Target /> Nouvelle attaque
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => attackMenu.dispatch({ type: 'close' })}
            >
              <X /> Fermer
            </Button>
          </>
        )}
      </footer>
    </>
  );
}

function StageNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3 py-2.5 text-[13px]">
      <span className="text-primary">{icon}</span>
      <span>{children}</span>
    </p>
  );
}
