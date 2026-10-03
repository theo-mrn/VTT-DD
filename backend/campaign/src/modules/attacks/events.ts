/**
 * Événements des attaques (docs/combat.md § 10.1), agrégat `attack`, écrits dans l'outbox dans
 * la transaction de la donnée. Aucun ne donne une valeur d'un PNJ à un joueur :
 *
 * - `combat.attack_updated` : signal (id, étape, statut, version), MJ + `visibleToUsers`
 *   (l'auteur, les joueurs dont une cible doit réagir) ; le client relit l'attaque (REST filtré) ;
 * - `combat.attack_resolved` : l'attaque complète, MJ seul (l'auteur reçoit l'enveloppe
 *   expurgée du service realtime et relit) ;
 * - `combat.attack_announced` : qui attaque qui et l'issue, public, pour une attaque `public` ;
 *   attaquant ou cible caché aux joueurs retiré (attaquant null) ;
 * - `combat.attack_decided`, `combat.attack_reverted` : MJ seul ;
 * - `combat.attack_concluded` : la décision, public pour une attaque `public`, montants pour le
 *   camp des joueurs seulement.
 */
import type {
  AttackAnnouncedPayload,
  AttackChange,
  AttackConcludedPayload,
  AttackDecidedPayload,
  AttackRevertedPayload,
  AttackUpdatedPayload,
  Visibility,
} from '@vtt/contracts';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import type { Role } from '../../db/schema.js';
import { actorRole } from '../campaigns/repository.js';
import { canReact } from './lifecycle.js';
import { fullAttack } from './redact.js';
import type { LoadedAttack } from './repository.js';
import { announceContext, knownToAll, playersOf } from './rights.js';
import { compareCodeUnits } from '@vtt/contracts';

export interface EventActor {
  userId: string;
  role: Role | null;
}

type AttackEventType =
  | 'combat.attack_updated'
  | 'combat.attack_resolved'
  | 'combat.attack_announced'
  | 'combat.attack_decided'
  | 'combat.attack_concluded'
  | 'combat.attack_reverted';

function attackEvent(
  tx: Tx,
  ctx: EventContext,
  l: LoadedAttack,
  actor: EventActor,
  e: {
    type: AttackEventType;
    payload: object;
    visibility: Visibility;
    /** Attaquant nommé dans l'enveloppe (historique « par personnage ») ; null s'il est caché. */
    characterId: string | null;
  },
) {
  return appendEvent(tx, ctx, {
    type: e.type,
    campaignId: l.attack.campaignId,
    actor: { userId: actor.userId, role: actorRole(actor.role), characterId: e.characterId },
    aggregate: { type: 'attack', id: l.attack.id },
    payload: e.payload as Record<string, unknown>,
    visibility: e.visibility,
  });
}

/**
 * Signal `combat.attack_updated` aux MJ, à l'auteur et aux joueurs des cibles qui peuvent
 * réagir (leur invite s'ouvre ou se ferme).
 */
export async function attackUpdated(
  tx: Tx,
  ctx: EventContext,
  l: LoadedAttack,
  actor: EventActor,
  change: AttackChange,
) {
  const reacting = new Set(l.targets.filter(canReact).map((t) => t.characterId));
  const players = await playersOf(tx, l.attack.campaignId, reacting);
  const users = [...new Set([l.attack.createdBy, ...players])].sort(compareCodeUnits);
  const payload: AttackUpdatedPayload = {
    attackId: l.attack.id,
    change,
    status: l.attack.status,
    version: l.attack.version,
  };
  await attackEvent(tx, ctx, l, actor, {
    type: 'combat.attack_updated',
    payload: { ...payload, visibleToUsers: users },
    visibility: 'gm_only',
    characterId: l.attack.attackerId,
  });
}

/**
 * Résolution : l'attaque complète aux MJ, et pour une attaque `public` l'annonce à tous (issue
 * de chaque cible connue de tous les joueurs, attaquant null s'il leur est caché).
 */
export async function attackResolved(
  tx: Tx,
  ctx: EventContext,
  l: LoadedAttack,
  actor: EventActor,
) {
  await attackEvent(tx, ctx, l, actor, {
    type: 'combat.attack_resolved',
    payload: { attack: fullAttack(l) },
    visibility: 'gm_only',
    characterId: l.attack.attackerId,
  });
  if (l.attack.visibility !== 'public' || l.attack.status === 'failed') return;
  const { sides, participants } = await announceContext(tx, l.attack.campaignId);
  const known = (id: string) => knownToAll(id, sides, participants);
  const attackerId = known(l.attack.attackerId) ? l.attack.attackerId : null;
  const payload: AttackAnnouncedPayload = {
    attackId: l.attack.id,
    version: l.attack.version,
    attackerId,
    action: { id: l.attack.actionId, name: l.attack.actionName },
    targets: l.targets
      .filter((t) => t.view && known(t.characterId))
      .map((t) => ({ characterId: t.characterId, outcome: t.view!.outcome })),
  };
  await attackEvent(tx, ctx, l, actor, {
    type: 'combat.attack_announced',
    payload,
    visibility: 'public',
    characterId: attackerId,
  });
}

/**
 * Décision du MJ : complète aux MJ ; pour une attaque `public`, la conclusion à tous (cibles
 * connues de tous, montants appliqués au camp des joueurs seulement).
 */
export async function attackDecided(
  tx: Tx,
  ctx: EventContext,
  l: LoadedAttack,
  actor: EventActor,
  decided: { applicationId: string | null; targetIds: string[]; actor: boolean },
) {
  const decidedTargets = l.targets.filter((t) => decided.targetIds.includes(t.characterId));
  const payload: AttackDecidedPayload = {
    attackId: l.attack.id,
    version: l.attack.version,
    applicationId: decided.applicationId,
    targets: decidedTargets.map((t) => ({
      characterId: t.characterId,
      decision: t.decision,
      applied: t.applied ?? null,
    })),
    ...(decided.actor ? { actor: l.attack.actor ?? null } : {}),
    note: l.attack.note ?? null,
  };
  await attackEvent(tx, ctx, l, actor, {
    type: 'combat.attack_decided',
    payload,
    visibility: 'gm_only',
    characterId: l.attack.attackerId,
  });
  if (l.attack.visibility !== 'public') return;
  const { sides, participants } = await announceContext(tx, l.attack.campaignId);
  const known = (id: string) => knownToAll(id, sides, participants);
  const attackerId = known(l.attack.attackerId) ? l.attack.attackerId : null;
  const concluded: AttackConcludedPayload = {
    attackId: l.attack.id,
    version: l.attack.version,
    attackerId,
    targets: decidedTargets
      .filter((t) => known(t.characterId))
      .map((t) => {
        const amounts =
          sides.get(t.characterId) === 'players' && t.applied
            ? t.applied.modifications.flatMap((m) =>
                m.kind === 'attribute' && m.entity === 'target' && m.operation !== 'set'
                  ? [
                      {
                        attribute: m.attribute,
                        value: m.operation === 'subtract' ? -m.value : m.value,
                        ...(m.damageType ? { damageType: m.damageType } : {}),
                      },
                    ]
                  : [],
              )
            : undefined;
        return {
          characterId: t.characterId,
          decision: t.decision,
          ...(amounts ? { amounts } : {}),
        };
      }),
  };
  await attackEvent(tx, ctx, l, actor, {
    type: 'combat.attack_concluded',
    payload: concluded,
    visibility: 'public',
    characterId: attackerId,
  });
}

/** Application annulée (MJ seul). */
export async function attackReverted(
  tx: Tx,
  ctx: EventContext,
  l: LoadedAttack,
  actor: EventActor,
  e: Omit<AttackRevertedPayload, 'attackId' | 'version'>,
) {
  const payload: AttackRevertedPayload = { attackId: l.attack.id, version: l.attack.version, ...e };
  await attackEvent(tx, ctx, l, actor, {
    type: 'combat.attack_reverted',
    payload,
    visibility: 'gm_only',
    characterId: l.attack.attackerId,
  });
}
