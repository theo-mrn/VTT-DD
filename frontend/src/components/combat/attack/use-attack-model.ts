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
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import type { ActionParams, Attack, DeclareAttack } from '@vtt/contracts';
import type { Action, Fiche } from '@vtt/rules';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { chooseDiceMode, clientRunner } from '@/lib/combat/dice-steps';
import {
  combatContextOf,
  continueLocal,
  isFinished,
  localAttackOf,
  LocalRefusal,
  LOCAL_ATTACK_PREFIX,
  needsReaction,
  resolvedReport,
  startLocal,
  type DiceRoller,
  type LocalAttackMeta,
  type LocalSession,
} from '@/lib/combat/local-attack';
import { mergeParams, missingParams, paramsToSend } from '@/lib/combat/params';
import { useAttackCommands } from '@/lib/combat/use-attacks';
import { combatSettings, currentActorId } from '@/lib/combat/use-combat';
import { clesPersonnages, personnages } from '@/lib/personnages';
import { calculerMemo } from '@/lib/rules-cache';
import { useComputedSheet, type AttackContext } from './use-attack-context';
import { actionGenerique } from '@/lib/combat/capacities';
import { useUsagesPersonnages } from '@/lib/personnages';
import { messageErreur } from '@/lib/api';
import { toast } from 'sonner';
import { startBusinessSpan } from '@/lib/telemetry/tracer';

/** Faces tirées dans le navigateur, étape par étape. */
const browserDice: DiceRoller = async (step) => (await clientRunner.run(step)).results;

/** Attaque calculée dans le navigateur, entre deux étapes : de quoi la finir et l'envoyer. */
interface LocalEntry {
  session: LocalSession;
  meta: LocalAttackMeta;
  body: DeclareAttack;
  key: string;
}

export type OpenFlow = Exclude<AttackFlowState, { phase: 'closed' }>;

const sameParams = (a: Record<string, unknown>, b: Record<string, unknown>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

export function useAttackModel(flow: OpenFlow, ctx: AttackContext) {
  const t = useTranslations();
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
  const client = useQueryClient();
  const usages = useUsagesPersonnages();
  /** Attaques calculées ici, pas encore envoyées (entre le jet et les dégâts). */
  const locals = useRef(new Map<string, LocalEntry>());

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
  // L'action générique du menu Capacités ne se joue qu'avec une capacité : hors de la liste
  const generique = actionGenerique(ctx.presentation);
  const groups = useMemo(
    () =>
      groupActions(
        actions.filter((a) => a.id !== generique),
        ctx.presentation,
      ),
    [actions, ctx.presentation, generique],
  );
  const action = actions.find((a) => a.id === draft.actionId) ?? null;
  const remembered = memory
    ? (actions.find((a) => a.id === memory.actionId && a.id !== generique) ?? null)
    : null;

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

  let disabledReason: string | null = null;
  if (!draft.attackerId) disabledReason = t('combat.submit.noAttacker');
  else if (blocked) disabledReason = t('combat.attack.notYourTurn');
  else if (!check.ok) disabledReason = check.message;
  else if (missing.length)
    disabledReason = t('combat.attack.noneAvailableFor', { name: missing[0]!.nom });

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

  /** Attaque calculée dans le navigateur : rapportée aussitôt si elle est finie, sinon gardée ici. */
  async function browserAttack(
    session: LocalSession,
    body: DeclareAttack,
    key: string,
    a: Action,
  ): Promise<Attack> {
    const meta: LocalAttackMeta = {
      id: `${LOCAL_ATTACK_PREFIX}${key}`,
      campaignId: flow.campaignId,
      combat: ctx.combat,
      attackerId: body.attackerId,
      actionName: a.nom,
      visibility: effectiveVisibility(draft, { gm: ctx.gm, settings }),
      gm: ctx.gm,
      userId: ctx.me.id,
      origin: body.origin,
      presetId: body.presetId,
    };
    const entry: LocalEntry = { session, meta, body, key };
    if (isFinished(session)) return report(entry);
    locals.current.set(meta.id, entry);
    return localAttackOf(session, meta);
  }

  /** Une utilisation de la capacité jouée, sur la fiche de l'acteur (refus : signalé). */
  async function consumeUsage(characterId: string, entree: string) {
    try {
      await usages.consume(characterId, entree);
    } catch (err) {
      toast.error(messageErreur(err));
    }
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
    // Du clic sur « Lancer » à l'attaque déclarée (jet compris quand il se fait ici)
    const traced = startBusinessSpan('combat.attack', {
      'vtt.campaign.id': flow.campaignId,
      'vtt.action.id': action.id,
      'vtt.targets': body.targets.length,
    });
    try {
      // Calcul dans le navigateur (Théo, 2026-09-30) ; défense active : le serveur, comme avant
      const session = await startInBrowser(body);
      const attack = session
        ? await browserAttack(session, body, key, action)
        : await commands.declare(body, key);
      setLiveAttackId(attack.id);
      attackMenu.dispatch({ type: 'declared', attack });
      traced.end(session ? 'browser' : 'server', { 'vtt.attack.status': attack.status });
      // Capacité jouée depuis le menu Capacités : une utilisation consommée
      if (draft.usage) void consumeUsage(body.attackerId, draft.usage);
      if (action.id !== generique)
        rememberAttack(browserMemory(), flow.campaignId, body.attackerId, {
          actionId: action.id,
          params,
        });
    } catch (err) {
      if (err instanceof LocalRefusal) traced.end('refused');
      else traced.fail(err);
      attackMenu.dispatch({
        type: 'rejected',
        message: err instanceof LocalRefusal ? err.message : combatErrorMessage(err),
        retryable: !(err instanceof LocalRefusal) && isRetryable(err),
      });
    }
  }

  /**
   * Fiches des cibles (lues à l'instant : l'instantané de l'attaque), puis le jet dans le
   * navigateur. null : l'attaque passe par le serveur (une cible a une défense active à
   * choisir, ou une fiche n'a pas pu être lue).
   */
  async function startInBrowser(body: DeclareAttack): Promise<LocalSession | null> {
    if (!systeme || !fiche || !action) return null;
    let targets: { id: string; fiche: Fiche }[];
    try {
      targets = await Promise.all(
        body.targets.map(async (id) => {
          if (id === body.attackerId) return { id, fiche };
          const p = await client.fetchQuery({
            queryKey: clesPersonnages.un(id),
            queryFn: () => personnages.lire(id),
            staleTime: 2_000,
          });
          return { id, fiche: calculerMemo(systeme, p.state) };
        }),
      );
    } catch {
      return null;
    }
    if (needsReaction(systeme, action.id, targets)) return null;
    return startLocal(
      {
        systeme,
        actionId: action.id,
        actor: fiche,
        targets,
        params: body.params ?? {},
        rollMode: body.rollMode ?? 'per_target',
        adjustments: body.adjustments,
        combat: combatContextOf(ctx.combat, body.attackerId, body.targets),
        attackerId: body.attackerId,
      },
      browserDice,
    );
  }

  /** Une seule requête, à la fin : le rapport résolu, rangé en attente du MJ. */
  function report(entry: LocalEntry): Promise<Attack> {
    const { session, meta, body, key } = entry;
    const params = session.params;
    return commands.declare(
      {
        ...body,
        ...(Object.keys(params).length ? { params } : {}),
        resolved: resolvedReport(session, meta.actionName),
      },
      key,
    );
  }

  /**
   * Étape suivante d'une attaque calculée ici (l'arme puis les dégâts, la table), sans appel
   * réseau ; une fois résolue, le rapport part et remplace l'attaque locale. Un envoi en échec
   * se reprend tel quel (mêmes faces, même clé).
   */
  async function continueInBrowser(attack: Attack, stepParams?: ActionParams) {
    const entry = locals.current.get(attack.id);
    if (!entry) throw new Error('Cette attaque n’est plus en cours');
    if (!isFinished(entry.session))
      entry.session = await continueLocal(entry.session, stepParams, browserDice);
    if (!isFinished(entry.session)) {
      attackMenu.dispatch({
        type: 'attackUpdated',
        attack: localAttackOf(entry.session, entry.meta),
      });
      return;
    }
    const reported = await report(entry);
    locals.current.delete(attack.id);
    setLiveAttackId(reported.id);
    attackMenu.dispatch({ type: 'reported', localId: attack.id, attack: reported });
  }

  /** Abandon d'une attaque calculée ici : rien n'a été envoyé, rien ne part. */
  function cancelInBrowser(attack: Attack) {
    const entry = locals.current.get(attack.id);
    locals.current.delete(attack.id);
    if (entry)
      attackMenu.dispatch({
        type: 'attackUpdated',
        attack: localAttackOf(entry.session, entry.meta, 'cancelled'),
      });
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
    continueInBrowser,
    cancelInBrowser,
  };
}

export type AttackModel = ReturnType<typeof useAttackModel>;
