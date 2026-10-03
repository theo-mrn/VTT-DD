/**
 * Client typé du combat (docs/combat.md § 11.1) : routes du service campaign derrière la
 * gateway, typées par le contrat (`@vtt/contracts`, `combat.ts`). Aucune règle ici : le
 * serveur fait autorité, il filtre ce qu'un joueur reçoit (vue expurgée, `redacted`).
 *
 * Utilisé par le menu d'attaque (lot 3), le panneau des tours et les rapports (lot 4) :
 *
 * ```ts
 * import { attacksApi, combatApi, combatKeys, newIdempotencyKey } from '@/lib/combat/api';
 *
 * const combat = await combatApi.get(campaignId);              // null : aucun combat
 * const next = await combatApi.next(campaignId, { version: combat.version });
 * const attack = await attacksApi.declare(campaignId, body, newIdempotencyKey());
 * ```
 *
 * Les hooks (`use-combat.ts`, `use-attacks.ts`) gardent ces réponses dans le cache TanStack
 * sous `combatKeys` et les relisent sur les événements `combat.*` (§ 10).
 *
 * Erreurs : `ApiError` de `lib/api.ts` ; `combatErrorMessage(err)` donne un message lisible
 * pour les codes du combat (`not_their_turn`, `action_refused`…).
 */
import type {
  AddCombatParticipants,
  ApplyAttack,
  ApplyAttacks,
  Attack,
  AttackPage,
  AttackReaction,
  CancelAttack,
  ChooseSlotActor,
  CombatState,
  CombatTurnResponse,
  DeclareAttack,
  DeclareAttacks,
  DismissAttack,
  EndCombat,
  ListAttacksQuery,
  NextTurn,
  OverrideAttackOutcome,
  ParticipantInitiativeResult,
  PreviousTurn,
  ReorderCombat,
  RevertAttack,
  RollCombatInitiative,
  RollParticipantInitiative,
  SetTurn,
  StartCombat,
  SubmitRollDice,
  UpdateCombatParticipant,
  UpdateCombatSettings,
} from '@vtt/contracts';
import { api, ApiError, messageErreur } from '../api';
import { randomId } from '@/lib/random-id';

// ─── Adresses ────────────────────────────────────────────────────────────────

const campaignUrl = (campaignId: string, rest = '') =>
  `/v1/campaigns/${encodeURIComponent(campaignId)}${rest}`;
const combatUrl = (campaignId: string, rest = '') => campaignUrl(campaignId, `/combat${rest}`);
const attackUrl = (campaignId: string, attackId: string, rest = '') =>
  campaignUrl(campaignId, `/attacks/${encodeURIComponent(attackId)}${rest}`);
const participantUrl = (campaignId: string, characterId: string, rest = '') =>
  combatUrl(campaignId, `/participants/${encodeURIComponent(characterId)}${rest}`);

const send = <T>(method: string, path: string, body?: unknown, headers?: HeadersInit) =>
  api<T>(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(headers ? { headers } : {}),
  });

/** Clé d'idempotence d'une déclaration (double clic, reprise réseau : même clé). */
export function newIdempotencyKey(): string {
  return randomId();
}

const idempotency = (key: string) => ({ 'idempotency-key': key });

/** Chaîne de requête de `GET …/attacks` (les absents ne partent pas). */
export function attacksQueryString(query: ListAttacksQuery = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : '';
}

// ─── Clés du cache ───────────────────────────────────────────────────────────

/** Requête de liste normalisée (même filtre, même clé). */
function normalizeQuery(query: ListAttacksQuery = {}) {
  return {
    status: query.status ?? 'all',
    combatId: query.combatId ?? null,
    attackerId: query.attackerId ?? null,
    before: query.before ?? null,
    limit: query.limit ?? null,
  };
}

export const combatKeys = {
  /** Tout ce qui touche au combat d'une campagne. */
  all: (campaignId: string) => ['combat', campaignId] as const,
  /** État du combat (`CombatState`, ou null : aucun combat). */
  state: (campaignId: string) => ['combat', campaignId, 'state'] as const,
  /** Toutes les attaques (listes et détail). */
  attacks: (campaignId: string) => ['combat', campaignId, 'attacks'] as const,
  attackLists: (campaignId: string) => ['combat', campaignId, 'attacks', 'list'] as const,
  attackList: (campaignId: string, query: ListAttacksQuery = {}) =>
    ['combat', campaignId, 'attacks', 'list', normalizeQuery(query)] as const,
  attack: (campaignId: string, attackId: string) =>
    ['combat', campaignId, 'attacks', 'one', attackId] as const,
};

// ─── Combat : tours, participants, initiative ────────────────────────────────

export const combatApi = {
  /** État du combat en cours (vue expurgée pour un joueur) ; null s'il n'y en a pas. */
  async get(campaignId: string): Promise<CombatState | null> {
    try {
      return await api<CombatState>(combatUrl(campaignId));
    } catch (err) {
      // `no_combat` : aucun combat ; tout autre 404 (campagne quittée) : rien à montrer non plus
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  start: (campaignId: string, body: StartCombat) =>
    send<CombatState>('POST', combatUrl(campaignId), body),
  rollInitiative: (campaignId: string, body: RollCombatInitiative = {}) =>
    send<CombatState>('POST', combatUrl(campaignId, '/initiative'), body),
  next: (campaignId: string, body: NextTurn = {}) =>
    send<CombatTurnResponse>('POST', combatUrl(campaignId, '/next'), body),
  previous: (campaignId: string, body: PreviousTurn = {}) =>
    send<CombatTurnResponse>('POST', combatUrl(campaignId, '/previous'), body),
  setTurn: (campaignId: string, body: SetTurn) =>
    send<CombatState>('POST', combatUrl(campaignId, '/turn'), body),
  chooseSlotActor: (campaignId: string, body: ChooseSlotActor) =>
    send<CombatState>('POST', combatUrl(campaignId, '/slot-actor'), body),
  reorder: (campaignId: string, body: ReorderCombat) =>
    send<CombatState>('PUT', combatUrl(campaignId, '/order'), body),
  updateSettings: (campaignId: string, body: UpdateCombatSettings) =>
    send<CombatState>('PATCH', combatUrl(campaignId, '/settings'), body),
  addParticipants: (campaignId: string, body: AddCombatParticipants) =>
    send<CombatState>('POST', combatUrl(campaignId, '/participants'), body),
  updateParticipant: (campaignId: string, characterId: string, body: UpdateCombatParticipant) =>
    send<CombatState>('PATCH', participantUrl(campaignId, characterId), body),
  removeParticipant: (campaignId: string, characterId: string) =>
    send<CombatState>('DELETE', participantUrl(campaignId, characterId)),
  rollParticipantInitiative: (
    campaignId: string,
    characterId: string,
    body: RollParticipantInitiative = {},
  ) =>
    send<ParticipantInitiativeResult>(
      'POST',
      participantUrl(campaignId, characterId, '/initiative'),
      body,
    ),
  submitInitiativeDice: (campaignId: string, characterId: string, body: SubmitRollDice) =>
    send<ParticipantInitiativeResult>(
      'POST',
      participantUrl(campaignId, characterId, '/initiative/dice'),
      body,
    ),
  end: (campaignId: string, body: EndCombat = {}) =>
    send<void>('POST', combatUrl(campaignId, '/end'), body),
};

// ─── Attaques et rapports ────────────────────────────────────────────────────

export const attacksApi = {
  /**
   * Déclare une attaque ; `idempotencyKey` : la même pour une reprise (double clic, réseau).
   * Une requête de même clé encore en cours (409 `idempotency_in_progress`) est reprise avec la
   * même clé : le serveur rend alors la réponse de la première, sans relancer de dé.
   */
  declare: (campaignId: string, body: DeclareAttack, idempotencyKey: string) =>
    retryWhileInProgress(() =>
      send<Attack>('POST', campaignUrl(campaignId, '/attacks'), body, idempotency(idempotencyKey)),
    ),
  /** Plusieurs attaques d'un coup (MJ, PNJ à la suite) ; même reprise que `declare`. */
  declareMany: (campaignId: string, body: DeclareAttacks, idempotencyKey: string) =>
    retryWhileInProgress(() =>
      send<{ attacks: Attack[] }>(
        'POST',
        campaignUrl(campaignId, '/attacks/batch'),
        body,
        idempotency(idempotencyKey),
      ),
    ),
  /** Attaques filtrées pour l'appelant, les plus récentes d'abord. */
  list: (campaignId: string, query: ListAttacksQuery = {}) =>
    api<AttackPage>(campaignUrl(campaignId, `/attacks${attacksQueryString(query)}`)),
  get: (campaignId: string, attackId: string) => api<Attack>(attackUrl(campaignId, attackId)),
  react: (campaignId: string, attackId: string, body: AttackReaction) =>
    send<Attack>('POST', attackUrl(campaignId, attackId, '/reactions'), body),
  submitDice: (campaignId: string, attackId: string, body: SubmitRollDice) =>
    send<Attack>('POST', attackUrl(campaignId, attackId, '/dice'), body),
  cancel: (campaignId: string, attackId: string, body: CancelAttack = {}) =>
    send<Attack>('POST', attackUrl(campaignId, attackId, '/cancel'), body),
  apply: (campaignId: string, attackId: string, body: ApplyAttack) =>
    send<Attack>('POST', attackUrl(campaignId, attackId, '/apply'), body),
  applyMany: (campaignId: string, body: ApplyAttacks) =>
    send<{ attacks: Attack[] }>('POST', campaignUrl(campaignId, '/attacks/apply'), body),
  dismiss: (campaignId: string, attackId: string, body: DismissAttack) =>
    send<Attack>('POST', attackUrl(campaignId, attackId, '/dismiss'), body),
  revert: (campaignId: string, attackId: string, body: RevertAttack) =>
    send<Attack>('POST', attackUrl(campaignId, attackId, '/revert'), body),
  override: (campaignId: string, attackId: string, body: OverrideAttackOutcome) =>
    send<Attack>('POST', attackUrl(campaignId, attackId, '/override'), body),
};

// ─── Erreurs ─────────────────────────────────────────────────────────────────

/** Messages des codes d'erreur du combat (docs/combat.md § 11.1). */
const MESSAGES: Record<string, string> = {
  no_combat: 'Aucun combat en cours.',
  attack_not_found: 'Cette attaque n’existe plus.',
  target_not_found: 'Une des cibles n’est pas visible ou n’existe plus.',
  not_their_turn: 'Ce n’est pas le tour de ce personnage.',
  already_acted: 'Ce personnage a déjà agi ce round.',
  version_conflict: 'Le combat a changé entre-temps : réessayez.',
  combat_changed: 'Le combat a changé entre-temps : réessayez.',
  already_resolved: 'L’attaque est déjà résolue.',
  step_outdated: 'Ces dés ont déjà été lancés.',
  invalid_physical_result: 'Les faces lues sur les dés sont invalides.',
  resolution_in_progress: 'Les dés précédents sont en train d’être comptés : patientez.',
  character_unavailable: 'Les fiches ne répondent pas : rien n’a été fait, réessayez.',
  no_initiative: 'Le système ne déclare pas d’initiative.',
  nothing_to_undo: 'Aucun passage de tour à annuler.',
  revert_conflict: 'La fiche a changé depuis l’application.',
  idempotency_in_progress: 'La même demande est encore en cours : réessayez dans un instant.',
};

/** Messages des règles joints à un refus (`action_refused` : `errors` ou `messages`). */
export function refusalMessages(err: unknown): string[] {
  if (!(err instanceof ApiError)) return [];
  const p = err.problem as unknown as { errors?: unknown; messages?: unknown };
  const list = Array.isArray(p.errors) ? p.errors : Array.isArray(p.messages) ? p.messages : [];
  return list.flatMap((e) =>
    typeof e === 'string'
      ? [e]
      : e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string'
        ? [(e as { message: string }).message]
        : [],
  );
}

/** Message lisible d'une erreur du combat. */
export function combatErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const code = err.problem.code;
    if (code === 'action_refused') {
      const reasons = refusalMessages(err);
      if (reasons.length) return reasons.join(' · ');
    }
    if (code && MESSAGES[code] && !err.problem.detail) return MESSAGES[code];
  }
  return messageErreur(err);
}

/** « Aucun combat » (404 `no_combat`) : le combat vient de se terminer, rien à signaler. */
export function isNoCombat(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && err.problem.code === 'no_combat';
}

/** Même requête (même clé d'idempotence) encore en cours de traitement (409). */
export function isInProgress(err: unknown): boolean {
  return (
    err instanceof ApiError && err.status === 409 && err.problem.code === 'idempotency_in_progress'
  );
}

/**
 * Erreur passagère (réseau, service indisponible, même requête encore en cours) : on peut
 * reprendre avec la même clé.
 */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 429 || err.status >= 500 || isInProgress(err);
}

/** Attentes avant de reprendre une requête encore en cours (le premier traitement finit). */
export const IN_PROGRESS_DELAYS_MS = [250, 500, 1000, 2000] as const;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Reprend `run` tant que le serveur répond 409 `idempotency_in_progress` (au plus une fois par
 * délai) ; toute autre erreur, ou la dernière, remonte telle quelle.
 */
export async function retryWhileInProgress<T>(
  run: () => Promise<T>,
  delays: readonly number[] = IN_PROGRESS_DELAYS_MS,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const delay = delays[attempt];
      if (!isInProgress(err) || delay === undefined) throw err;
      await wait(delay);
    }
  }
}
