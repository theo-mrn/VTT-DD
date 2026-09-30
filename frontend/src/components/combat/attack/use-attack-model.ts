'use client';

/**
 * Tout ce que le menu d'attaque calcule pour la composition (docs/combat.md § 5.2, § 12.1) :
 * fiche de l'attaquant, actions à cible et leurs groupes, action choisie, paramètres, aperçu,
 * ce qui empêche de lancer ; et les effets qui tiennent le brouillon à jour (attaquant par
 * défaut, dernière action de ce personnage, paramètres gardés d'une action à l'autre).
 *
 * L'état reste dans la machine (`attack-flow.ts`) : ce hook ne fait que la lire et lui envoyer
 * des événements.
 */
import type { ActionParams } from '@vtt/contracts';
import type { Action } from '@vtt/rules';
import { useEffect, useMemo, useState } from 'react';
import { useDicePreferences } from '@/lib/dice-preferences';
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
  defaultAttacker,
  effectiveRollMode,
  effectiveVisibility,
  submitKey,
  turnStanding,
  type AttackFlowState,
} from '@/lib/combat/attack-flow';
import { browserMemory, recallAttack, rememberAttack } from '@/lib/combat/attack-flow-memory';
import { attackMenu } from '@/lib/combat/attack-menu-store';
import { chooseDiceMode } from '@/lib/combat/dice-steps';
import { mergeParams, missingParams, paramsToSend } from '@/lib/combat/params';
import { useAttackCommands } from '@/lib/combat/use-attacks';
import { combatSettings, currentActorId } from '@/lib/combat/use-combat';
import { useComputedSheet, type AttackContext } from './use-attack-context';

export type OpenFlow = Exclude<AttackFlowState, { phase: 'closed' }>;

const sameParams = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

export function useAttackModel(flow: OpenFlow, ctx: AttackContext) {
  const systeme = ctx.systeme;
  const draft = flow.draft;
  const composing = flow.phase === 'compose';
  const busy = flow.phase === 'submitting';
  const sheet = useComputedSheet(ctx, draft.attackerId);
  const fiche = sheet.fiche;
  const actorId = currentActorId(ctx.combat);
  const settings = combatSettings(ctx.combat);
  const prefs = useDicePreferences();
  const commands = useAttackCommands(flow.campaignId);
  /** Attaque déclarée depuis ce menu (son résultat se dévoile ; une attaque rouverte non). */
  const [liveAttackId, setLiveAttackId] = useState<string | null>(null);

  const memory = useMemo(
    () => recallAttack(browserMemory(), flow.campaignId, draft.attackerId),
    [flow.campaignId, draft.attackerId],
  );

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

  const actions = useMemo(
    () => (fiche && systeme ? targetedActions(systeme, fiche) : []),
    [systeme, fiche],
  );
  const groups = useMemo(
    () => groupActions(actions, ctx.presentation),
    [actions, ctx.presentation],
  );
  const action = actions.find((a) => a.id === draft.actionId) ?? null;
  const remembered = memory ? (actions.find((a) => a.id === memory.actionId) ?? null) : null;

  // Action indisponible pour cet attaquant (ou aucune) : sa dernière, sinon la première ;
  // paramètres gardés s'ils restent valides (PNJ suivant, changement d'attaquant)
  useEffect(() => {
    if (!fiche || !systeme || !composing) return;
    const target = action ?? remembered ?? groups[0]?.actions[0] ?? null;
    if (!target) {
      if (draft.actionId) attackMenu.dispatch({ type: 'setAction', actionId: null });
      return;
    }
    const base =
      !action && memory && target.id === memory.actionId
        ? { ...draft.params, ...memory.params }
        : draft.params;
    const params = mergeParams(systeme, target, fiche, base);
    if (target.id !== draft.actionId)
      attackMenu.dispatch({ type: 'setAction', actionId: target.id, params });
    else if (!sameParams(params, draft.params)) attackMenu.dispatch({ type: 'setParams', params });
  }, [fiche, systeme, composing, action, remembered, memory, groups, draft.actionId, draft.params]);

  const multi = multitargetOf(action);
  const standing = turnStanding(ctx.combat, draft.attackerId, actorId);
  const blocked = blockedByTurn(standing, ctx.gm, settings);
  const missing =
    action && fiche && systeme ? missingParams(systeme, action, fiche, draft.params) : [];
  const check = canSubmit(flow, { maxTargets: multi.max });
  const preview =
    action && fiche && systeme ? previewRoll(systeme, action, fiche, draft.params) : null;
  const hidden = effectiveVisibility(draft, { gm: ctx.gm, settings }) === 'gm';
  const rollMode = effectiveRollMode(draft, multi.rollMode);

  const disabledReason = !draft.attackerId
    ? 'Choisissez qui attaque'
    : blocked
      ? 'Pas le tour de votre personnage'
      : !check.ok
        ? check.message
        : missing.length
          ? `${missing[0]!.nom} : aucune disponible`
          : null;

  /** Carte d'action choisie : ses paramètres (ceux de sa dernière attaque d'abord). */
  function choose(a: Action) {
    if (!fiche || !systeme || !composing) return;
    const base =
      memory && memory.actionId === a.id ? { ...draft.params, ...memory.params } : draft.params;
    attackMenu.dispatch({
      type: 'chooseAction',
      actionId: a.id,
      params: mergeParams(systeme, a, fiche, base),
    });
  }

  /** `patch` : valeurs choisies au clic (carte du type d'attaque), gardées dans le brouillon. */
  async function submit(patch?: ActionParams) {
    if (flow.phase !== 'compose' || !action || !systeme || disabledReason) return;
    const key = submitKey(flow, newIdempotencyKey);
    const values = patch ? { ...draft.params, ...patch } : draft.params;
    if (patch) attackMenu.dispatch({ type: 'setParams', params: values });
    const params = paramsToSend(systeme, action, fiche, values);
    const body = declareBody(flow, {
      gm: ctx.gm,
      settings,
      params,
      actionDefaultRollMode: multi.rollMode,
      dice: chooseDiceMode({
        physicalAllowed: settings.physicalDice,
        animation3d: prefs.data?.animation3d ?? true,
      }),
    });
    attackMenu.dispatch({ type: 'submit', key });
    try {
      const attack = await commands.declare(body, key);
      setLiveAttackId(attack.id);
      attackMenu.dispatch({ type: 'declared', attack });
      rememberAttack(browserMemory(), flow.campaignId, body.attackerId, {
        actionId: action.id,
        params,
      });
    } catch (err) {
      attackMenu.dispatch({
        type: 'rejected',
        message: combatErrorMessage(err),
        retryable: isRetryable(err),
      });
    }
  }

  return {
    sheet,
    fiche,
    systeme,
    actions,
    groups,
    action,
    remembered,
    multi,
    standing,
    blocked,
    missing,
    preview,
    hidden,
    rollMode,
    settings,
    busy,
    composing,
    disabledReason,
    successRule: hasSuccessRule(action),
    liveAttackId,
    commands,
    choose,
    submit,
  };
}

export type AttackModel = ReturnType<typeof useAttackModel>;
