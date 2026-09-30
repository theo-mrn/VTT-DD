/**
 * Machine à états du menu d'attaque (docs/combat.md § 5, § 8.2, § 12.1), pure et testée sans
 * DOM. L'interface (`components/combat/attack/`) et la carte (outil de visée, anneaux) la
 * pilotent par événements ; le magasin (`attack-menu-store.ts`) la garde pour l'onglet.
 *
 * ```
 *  closed ──open──► compose ──submit──► submitting ──declared──► declared
 *     ▲               ▲   │                  │                      │ attackUpdated (direct)
 *     │               │   └ aim on/off       └ rejected ─► compose  │
 *     └──── close ────┴──────── again (Nouvelle attaque, Mêmes cibles), nextAttacker ◄┘
 * ```
 *
 * - `compose` : attaquant, action, paramètres, cibles, options du jet ; `aiming` : l'outil de
 *   visée de la carte est actif (un clic sur un token l'ajoute ou le retire).
 * - `submitting` : la déclaration part, avec sa clé d'idempotence ; un échec passager la garde
 *   (`retryKey`) : « Attaquer » reprend la même déclaration, sans doublon.
 * - `declared` : l'attaque vit sa vie au serveur (réactions, dés, rapport, décision du MJ) ;
 *   l'étape affichée se déduit de son statut (`declaredStage`).
 * - `queue` : PNJ suivants d'une attaque « à la suite » (§ 8.2) : « Suivant » garde l'action,
 *   les paramètres communs et les cibles.
 */
import {
  ATTACK_TARGETS_MAX,
  type ActionParams,
  type ActionParamValue,
  type Attack,
  type AttackOrigin,
  type AttackRollMode,
  type AttackVisibility,
  type CombatSettings,
  type CombatState,
  type DeclareAttack,
  type RollAdjustments,
  type RollDiceMode,
} from '@vtt/contracts';
import type { CampaignSide } from '@vtt/contracts';

// ─── État ────────────────────────────────────────────────────────────────────

/** Ce qui ouvre le menu : token, sélection, gabarit, fiche, panneau Combat. */
export interface AttackMenuRequest {
  campaignId: string;
  origin: AttackOrigin;
  /** Attaquant choisi ; absent : celui par défaut (`defaultAttacker`). */
  attackerId?: string | null;
  /** Plusieurs PNJ à la suite (§ 8.2) : le premier attaque, les autres suivent. */
  attackers?: readonly string[];
  targetIds?: readonly string[];
  actionId?: string | null;
}

/** Ajustements libres (hors règles) : dés à symboles par sorte, bonus au total. */
export interface FreeAdjustments {
  dice: Readonly<Record<string, number>>;
  bonus: number;
}

export const NO_ADJUSTMENTS: FreeAdjustments = { dice: {}, bonus: 0 };

export interface AttackDraft {
  attackerId: string | null;
  actionId: string | null;
  presetId: string | null;
  /** Valeurs du formulaire (`''` : entrée facultative non choisie). */
  params: ActionParams;
  targetIds: readonly string[];
  /** null : le mode que déclare l'action. */
  rollMode: AttackRollMode | null;
  /** null : le défaut (dés du serveur tant que les dés 3D ne sont pas branchés). */
  dice: RollDiceMode | null;
  /** null : le défaut (MJ : cachée si `gmRollsHidden`, joueur : publique). */
  visibility: AttackVisibility | null;
  adjustments: FreeAdjustments;
}

interface Opened {
  campaignId: string;
  origin: AttackOrigin;
  draft: AttackDraft;
  /** Attaquants suivants (PNJ à la suite). */
  queue: readonly string[];
}

export type AttackFlowState =
  | { phase: 'closed' }
  | (Opened & {
      phase: 'compose';
      aiming: boolean;
      /** L'attaquant n'a pas été choisi : l'interface pose celui par défaut. */
      autoAttacker: boolean;
      error: string | null;
      /** Clé d'une déclaration qui a échoué en route (réseau) : reprise sans doublon. */
      retryKey: string | null;
    })
  | (Opened & { phase: 'submitting'; key: string })
  | (Opened & { phase: 'declared'; attack: Attack });

export type ComposeState = Extract<AttackFlowState, { phase: 'compose' }>;
export type DeclaredState = Extract<AttackFlowState, { phase: 'declared' }>;

export const CLOSED: AttackFlowState = { phase: 'closed' };

export type AttackFlowEvent =
  | { type: 'open'; request: AttackMenuRequest }
  | { type: 'close' }
  | { type: 'setAttacker'; attackerId: string | null }
  | { type: 'setAction'; actionId: string | null; params?: ActionParams; presetId?: string | null }
  | { type: 'setParams'; params: ActionParams }
  | { type: 'setParam'; id: string; value: ActionParamValue }
  | { type: 'toggleTarget'; characterId: string }
  | { type: 'addTargets'; characterIds: readonly string[] }
  | { type: 'setTargets'; characterIds: readonly string[] }
  | { type: 'removeTarget'; characterId: string }
  | { type: 'aim'; on: boolean }
  | { type: 'setRollMode'; rollMode: AttackRollMode | null }
  | { type: 'setDice'; dice: RollDiceMode | null }
  | { type: 'setVisibility'; visibility: AttackVisibility | null }
  /** `die` null : le bonus au total ; sinon le nombre de dés ajoutés (négatif : retirés). */
  | { type: 'setAdjustment'; die: string | null; value: number }
  | { type: 'resetAdjustments' }
  | { type: 'submit'; key: string }
  | { type: 'declared'; attack: Attack }
  | { type: 'rejected'; message: string; retryable: boolean }
  | { type: 'attackUpdated'; attack: Attack }
  /** Montrer une attaque déjà déclarée (« Mes attaques ») : son suivi en direct. */
  | { type: 'show'; attack: Attack }
  /** « Nouvelle attaque » (cibles vidées) ou « Mêmes cibles ». */
  | { type: 'again'; keepTargets: boolean }
  /** PNJ suivant d'une attaque à la suite. */
  | { type: 'nextAttacker' };

const unique = (ids: readonly string[]) => [...new Set(ids.filter(Boolean))];

function emptyDraft(request: AttackMenuRequest, attackerId: string | null): AttackDraft {
  return {
    attackerId,
    actionId: request.actionId ?? null,
    presetId: null,
    params: {},
    targetIds: unique(request.targetIds ?? []).slice(0, ATTACK_TARGETS_MAX),
    rollMode: null,
    dice: null,
    visibility: null,
    adjustments: NO_ADJUSTMENTS,
  };
}

function compose(opened: Opened, patch: Partial<ComposeState> = {}): ComposeState {
  return {
    ...opened,
    phase: 'compose',
    aiming: false,
    autoAttacker: false,
    error: null,
    retryKey: null,
    ...patch,
  };
}

const opened = (s: Exclude<AttackFlowState, { phase: 'closed' }>): Opened => ({
  campaignId: s.campaignId,
  origin: s.origin,
  draft: s.draft,
  queue: s.queue,
});

/** Le brouillon change : une déclaration en échec ne se reprend plus telle quelle. */
function editDraft(s: ComposeState, draft: Partial<AttackDraft>): ComposeState {
  return { ...s, draft: { ...s.draft, ...draft }, retryKey: null, error: null };
}

function setTargets(s: ComposeState, ids: readonly string[]): ComposeState {
  return editDraft(s, { targetIds: unique(ids).slice(0, ATTACK_TARGETS_MAX) });
}

// ─── Transitions ─────────────────────────────────────────────────────────────

export function reduceAttackFlow(state: AttackFlowState, event: AttackFlowEvent): AttackFlowState {
  switch (event.type) {
    case 'open': {
      const r = event.request;
      const queue = unique(r.attackers ?? []);
      const first = r.attackerId ?? queue[0] ?? null;
      const rest = queue.filter((id) => id !== first);
      return compose(
        {
          campaignId: r.campaignId,
          origin: r.origin,
          draft: emptyDraft(r, first),
          queue: rest,
        },
        { autoAttacker: r.attackerId === undefined && !queue.length },
      );
    }
    case 'close':
      return CLOSED;
  }

  if (state.phase === 'closed') return state;

  switch (event.type) {
    case 'declared':
      return state.phase === 'submitting'
        ? { ...opened(state), phase: 'declared', attack: event.attack }
        : state;
    case 'rejected':
      return state.phase === 'submitting'
        ? compose(opened(state), {
            error: event.message,
            retryKey: event.retryable ? state.key : null,
          })
        : state;
    case 'attackUpdated':
      if (state.phase !== 'declared' || state.attack.id !== event.attack.id) return state;
      return event.attack.version >= state.attack.version
        ? { ...state, attack: event.attack }
        : state;
    case 'show': {
      if (state.phase === 'submitting') return state;
      const a = event.attack;
      return {
        ...opened(state),
        phase: 'declared',
        attack: a,
        draft: {
          ...state.draft,
          attackerId: a.attackerId,
          actionId: a.action.id,
          presetId: a.presetId ?? null,
          params: a.params,
          targetIds: a.targets.map((t) => t.characterId),
        },
      };
    }
    case 'again':
      if (state.phase === 'submitting') return state;
      return compose({
        ...opened(state),
        draft: {
          ...state.draft,
          targetIds: event.keepTargets ? state.draft.targetIds : [],
          adjustments: NO_ADJUSTMENTS,
        },
      });
    case 'nextAttacker': {
      if (state.phase === 'submitting' || !state.queue.length) return state;
      const [next, ...rest] = state.queue;
      return compose({
        ...opened(state),
        draft: { ...state.draft, attackerId: next!, adjustments: NO_ADJUSTMENTS },
        queue: rest,
      });
    }
  }

  // Tout le reste modifie le brouillon : seulement pendant la composition
  if (state.phase !== 'compose') return state;
  const s = state;
  switch (event.type) {
    case 'setAttacker':
      if (event.attackerId === s.draft.attackerId && !s.autoAttacker) return s;
      return { ...editDraft(s, { attackerId: event.attackerId }), autoAttacker: false };
    case 'setAction':
      return editDraft(s, {
        actionId: event.actionId,
        params: event.params ?? {},
        presetId: event.presetId ?? null,
      });
    case 'setParams':
      return editDraft(s, { params: event.params });
    case 'setParam':
      return editDraft(s, { params: { ...s.draft.params, [event.id]: event.value } });
    case 'toggleTarget':
      return setTargets(
        s,
        s.draft.targetIds.includes(event.characterId)
          ? s.draft.targetIds.filter((id) => id !== event.characterId)
          : [...s.draft.targetIds, event.characterId],
      );
    case 'addTargets':
      return setTargets(s, [...s.draft.targetIds, ...event.characterIds]);
    case 'setTargets':
      return setTargets(s, event.characterIds);
    case 'removeTarget':
      return setTargets(
        s,
        s.draft.targetIds.filter((id) => id !== event.characterId),
      );
    case 'aim':
      return event.on === s.aiming ? s : { ...s, aiming: event.on };
    case 'setRollMode':
      return editDraft(s, { rollMode: event.rollMode });
    case 'setDice':
      return editDraft(s, { dice: event.dice });
    case 'setVisibility':
      return editDraft(s, { visibility: event.visibility });
    case 'setAdjustment': {
      const value = Math.trunc(event.value) || 0;
      const a = s.draft.adjustments;
      if (event.die === null) return editDraft(s, { adjustments: { ...a, bonus: value } });
      const { [event.die]: _old, ...dice } = a.dice;
      return editDraft(s, {
        adjustments: { ...a, dice: value ? { ...dice, [event.die]: value } : dice },
      });
    }
    case 'resetAdjustments':
      return editDraft(s, { adjustments: NO_ADJUSTMENTS });
    case 'submit':
      if (!canSubmit(s).ok) return s;
      return { ...opened(s), phase: 'submitting', key: event.key };
  }
  return s;
}

// ─── Lectures ────────────────────────────────────────────────────────────────

/** Le menu est ouvert pour cette campagne. */
export const isOpenFor = (s: AttackFlowState, campaignId: string) =>
  s.phase !== 'closed' && s.campaignId === campaignId;

export type SubmitCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'no_attacker' | 'no_action' | 'no_target' | 'too_many_targets' | 'busy';
      message: string;
    };

/** « Attaquer » est possible ; sinon, pourquoi (texte du bouton désactivé). */
export function canSubmit(s: AttackFlowState, limits: { maxTargets?: number } = {}): SubmitCheck {
  if (s.phase !== 'compose') return { ok: false, reason: 'busy', message: 'Attaque en cours' };
  const d = s.draft;
  if (!d.attackerId) return { ok: false, reason: 'no_attacker', message: 'Choisissez qui attaque' };
  if (!d.actionId) return { ok: false, reason: 'no_action', message: 'Choisissez une action' };
  if (!d.targetIds.length)
    return { ok: false, reason: 'no_target', message: 'Choisissez au moins une cible' };
  const max = Math.min(limits.maxTargets ?? ATTACK_TARGETS_MAX, ATTACK_TARGETS_MAX);
  if (d.targetIds.length > max)
    return {
      ok: false,
      reason: 'too_many_targets',
      message: `${max} cible${max > 1 ? 's' : ''} au plus pour cette action`,
    };
  return { ok: true };
}

/** Clé d'idempotence de la prochaine déclaration : celle d'un essai interrompu, sinon neuve. */
export const submitKey = (s: AttackFlowState, fresh: () => string) =>
  s.phase === 'compose' && s.retryKey ? s.retryKey : fresh();

/** Mode de jet effectif : choisi, sinon celui de l'action ; sans objet pour une seule cible. */
export function effectiveRollMode(
  draft: AttackDraft,
  actionDefault: AttackRollMode,
): AttackRollMode {
  if (draft.targetIds.length < 2) return 'per_target';
  return draft.rollMode ?? actionDefault;
}

/** Visibilité effective : choisie, sinon celle du réglage (MJ caché par défaut, § 9.2). */
export function effectiveVisibility(
  draft: AttackDraft,
  ctx: { gm: boolean; settings: CombatSettings },
): AttackVisibility {
  if (draft.visibility) return draft.visibility;
  return ctx.gm && ctx.settings.gmRollsHidden ? 'gm' : 'public';
}

export function adjustmentsToSend(a: FreeAdjustments): RollAdjustments | undefined {
  const dice = Object.entries(a.dice)
    .filter(([, n]) => n !== 0)
    .map(([die, count]) => ({ die, count }));
  if (!dice.length && !a.bonus) return undefined;
  return { ...(dice.length ? { dice } : {}), ...(a.bonus ? { bonus: a.bonus } : {}) };
}

export const hasAdjustments = (a: FreeAdjustments) => adjustmentsToSend(a) !== undefined;

/**
 * Corps de `POST …/attacks` (`DeclareAttack`) pour ce brouillon. `params` : les paramètres à
 * envoyer (ceux de l'attaquant, sans valeur vide : `paramsToSend`). La visibilité n'est
 * envoyée que pour le MJ (sa bascule) ou si elle a été choisie ; le mode de jet, dès deux
 * cibles ; les dés, toujours (`server` tant que les dés 3D ne sont pas branchés).
 */
export function declareBody(
  s: ComposeState,
  ctx: {
    gm: boolean;
    settings: CombatSettings;
    params: ActionParams;
    actionDefaultRollMode: AttackRollMode;
    dice: RollDiceMode;
  },
): DeclareAttack {
  const d = s.draft;
  const adjustments = adjustmentsToSend(d.adjustments);
  return {
    attackerId: d.attackerId!,
    action: d.actionId!,
    ...(Object.keys(ctx.params).length ? { params: ctx.params } : {}),
    targets: [...d.targetIds],
    ...(d.targetIds.length > 1
      ? { rollMode: effectiveRollMode(d, ctx.actionDefaultRollMode) }
      : {}),
    dice: ctx.dice,
    ...(ctx.gm || d.visibility ? { visibility: effectiveVisibility(d, ctx) } : {}),
    ...(d.presetId ? { presetId: d.presetId } : {}),
    ...(adjustments ? { adjustments } : {}),
    origin: s.origin,
  };
}

// ─── Attaque déclarée ────────────────────────────────────────────────────────

export type DeclaredStage = 'reactions' | 'dice' | 'result' | 'cancelled' | 'failed';

/** Étape à montrer pour une attaque déclarée, d'après son statut. */
export function declaredStage(attack: Attack): DeclaredStage {
  switch (attack.status) {
    case 'awaiting_reactions':
      return 'reactions';
    case 'awaiting_dice':
      return 'dice';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    default:
      return 'result';
  }
}

// ─── Attaquant et tour ───────────────────────────────────────────────────────

/**
 * Attaquant proposé à l'ouverture (§ 8.1, § 12.1) : celui demandé s'il est permis ; pour un
 * joueur, le personnage qu'il incarne ; pour le MJ, le participant qui agit s'il n'est pas du
 * camp des joueurs, sinon aucun (il choisit).
 */
export function defaultAttacker(input: {
  requested?: string | null;
  candidates: readonly string[];
  gm: boolean;
  heroId: string | null;
  currentActorId: string | null;
  sideOf: (characterId: string) => CampaignSide | null;
}): string | null {
  const { requested, candidates, gm, heroId, currentActorId, sideOf } = input;
  const allowed = new Set(candidates);
  if (requested && allowed.has(requested)) return requested;
  if (!gm) return heroId && allowed.has(heroId) ? heroId : (candidates[0] ?? null);
  if (currentActorId && allowed.has(currentActorId) && sideOf(currentActorId) !== 'players')
    return currentActorId;
  return null;
}

export type TurnStanding =
  /** Pas de combat (ou initiative pas tirée) : attaque hors combat, rien à dire. */
  | 'free'
  /** C'est son tour (ou un créneau de son camp sans acteur : attaquer le désigne). */
  | 'on_turn'
  /** Hors de son tour : marqué « hors tour », ou refusé si le réglage l'interdit à un joueur. */
  | 'out_of_turn';

/** Où en est l'attaquant par rapport au tour (§ 5.2, « Tour »). */
export function turnStanding(
  combat: CombatState | null | undefined,
  attackerId: string | null,
  actorId: string | null,
): TurnStanding {
  if (!combat || !attackerId || !combat.initiativeRolled) return 'free';
  const me = combat.order.find((p) => p.characterId === attackerId);
  // Pas participant (ou caché pour moi) : hors du tour de quiconque
  if (!me) return 'out_of_turn';
  if (actorId === attackerId) return 'on_turn';
  if (combat.mode === 'slots' && !actorId) {
    const side = combat.slots?.[combat.currentIndex]?.side;
    return side === me.side && !me.hasActed ? 'on_turn' : 'out_of_turn';
  }
  return 'out_of_turn';
}

/** Un joueur ne peut pas attaquer maintenant (réglage « hors tour » coupé, § 9.2). */
export function blockedByTurn(standing: TurnStanding, gm: boolean, settings: CombatSettings) {
  return !gm && standing === 'out_of_turn' && !settings.playersActOutsideTurn;
}
