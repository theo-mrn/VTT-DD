/**
 * Socle du module « messages » : qui lit quoi, représentation API et événements.
 *
 * Lecture (appliquée par le serveur ; l'ancienne app filtrait dans le navigateur, et
 * n'importe quel membre pouvait lire les chuchotements des autres dans Firestore) :
 *  - un message public : tous les membres ;
 *  - un chuchotement : son auteur, les membres destinataires, et les MJ s'il leur est
 *    adressé (`whisperGm`). Le MJ n'a aucun droit de plus : un chuchotement entre joueurs
 *    ne lui est pas montré, comme dans l'ancienne app.
 * Un message qu'on ne peut pas lire est introuvable (404), jamais interdit (403).
 *
 * Événements : jamais le texte (le journal history est en ajout seul : il ne doit pas figer
 * ce qu'un joueur a écrit puis effacé). Les clients relisent le message en REST.
 */
import type { Visibility } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Profile } from '../../clients/profiles.js';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import { campaignMembers, campaignMessages } from '../../db/schema.js';
import { campaignEvent, userApi, type Access } from '../campaigns/repository.js';
import { UserId, UserRef } from '../schemas.js';

export const MAX_BODY = 1000;
/** Destinataires d'un chuchotement (membres), comme la contrainte de la base. */
export const MAX_RECIPIENTS = 50;

export type MessageRow = typeof campaignMessages.$inferSelect;

/** Appelant : son identifiant et son accès à la campagne (rôle). */
export interface MessageViewer {
  access: Access;
  userId: string;
}

export const MessageBody = z
  .string()
  .trim()
  .min(1, 'Message vide')
  .max(MAX_BODY, `${MAX_BODY} caractères au plus`);

/** Destinataires demandés : des membres (utilisateurs) et/ou les MJ. */
export const RecipientsInput = z.object({
  gm: z.boolean().default(false),
  userIds: z
    .array(UserId)
    .max(MAX_RECIPIENTS, `${MAX_RECIPIENTS} destinataires au plus`)
    .default([]),
});
export type RecipientsInput = z.infer<typeof RecipientsInput>;

export const Message = z.object({
  id: z.string(),
  author: UserRef,
  body: z.string(),
  /** null : toute la table ; sinon un chuchotement. */
  recipients: z.object({ gm: z.boolean(), users: z.array(UserRef) }).nullable(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});

export const messageNotFound = () =>
  new HttpError(404, 'Ressource introuvable', 'message_not_found', 'Message introuvable');

/** Condition SQL : messages de la campagne lisibles par l'appelant. */
export function readableBy(v: MessageViewer): SQL {
  const m = campaignMessages;
  const audience: SQL[] = [
    isNull(m.whisperRecipients),
    eq(m.authorId, v.userId),
    sql`${v.userId}::uuid = any(${m.whisperRecipients})`,
  ];
  if (v.access.role === 'gm') audience.push(eq(m.whisperGm, true));
  return and(eq(m.campaignId, v.access.campaign.id), or(...audience))!;
}

/** Même règle que `readableBy`, pour un message déjà chargé. */
export const canRead = (m: MessageRow, v: MessageViewer) =>
  m.whisperRecipients === null ||
  m.authorId === v.userId ||
  m.whisperRecipients.includes(v.userId) ||
  (m.whisperGm && v.access.role === 'gm');

/** Message de la campagne lisible par l'appelant (verrouillé si `lock`), sinon 404. */
export async function loadMessage(db: Db | Tx, v: MessageViewer, messageId: string, lock = false) {
  const query = db
    .select()
    .from(campaignMessages)
    .where(
      and(
        eq(campaignMessages.id, messageId),
        eq(campaignMessages.campaignId, v.access.campaign.id),
      ),
    );
  const [message] = lock ? await query.for('update') : await query;
  if (!message || !canRead(message, v)) throw messageNotFound();
  return message;
}

/**
 * Colonnes d'un chuchotement validé : au moins un destinataire (membres ou MJ), des membres
 * de la campagne (dédoublonnés), jamais l'auteur lui-même ; 422 `invalid_recipient` sinon.
 */
export async function whisperColumns(
  tx: Tx,
  v: MessageViewer,
  r: RecipientsInput | null | undefined,
): Promise<Pick<MessageRow, 'whisperRecipients' | 'whisperGm'>> {
  if (!r) return { whisperRecipients: null, whisperGm: false };
  const ids = [...new Set(r.userIds)];
  if (!r.gm && !ids.length)
    throw HttpError.badRequest(
      'Un chuchotement a au moins un destinataire (un membre ou le MJ)',
      'recipients_required',
    );
  if (ids.includes(v.userId))
    throw new HttpError(
      422,
      'Refusé',
      'invalid_recipient',
      'On ne se chuchote pas un message à soi-même',
    );
  if (ids.length) {
    const found = await tx
      .select({ id: campaignMembers.userId })
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.campaignId, v.access.campaign.id),
          inArray(campaignMembers.userId, ids),
        ),
      );
    if (found.length !== ids.length)
      throw new HttpError(422, 'Refusé', 'invalid_recipient', 'Destinataire absent de la campagne');
  }
  return { whisperRecipients: ids, whisperGm: r.gm };
}

// ─── Représentation API ──────────────────────────────────────────────────────

/** Utilisateurs dont le profil sert à représenter ces messages (auteurs, destinataires). */
export const profileIds = (rows: MessageRow[]) => [
  ...new Set(rows.flatMap((m) => [m.authorId, ...(m.whisperRecipients ?? [])])),
];

export const messageApi = (m: MessageRow, profiles: Map<string, Profile>) => ({
  id: m.id,
  author: userApi(m.authorId, profiles),
  body: m.body,
  recipients:
    m.whisperRecipients === null
      ? null
      : { gm: m.whisperGm, users: m.whisperRecipients.map((id) => userApi(id, profiles)) },
  createdAt: m.createdAt.toISOString(),
  editedAt: m.editedAt?.toISOString() ?? null,
});

// ─── Événements ──────────────────────────────────────────────────────────────

/**
 * Événement de message, dans la transaction de la donnée. La charge utile ne porte jamais le
 * texte : l'id, l'auteur, les destinataires (`recipients`, null pour toute la table) et, pour
 * une modification, `editedAt`. Visibilité :
 *  - message public → `public` ;
 *  - chuchotement → `gm_only` + `visibleToUsers` (auteur et membres destinataires) : seul
 *    moyen de toucher ces joueurs en temps réel sans le reste de la table. Le MJ reçoit donc
 *    l'id et les destinataires d'un chuchotement entre joueurs, jamais son texte (qu'il ne
 *    peut pas relire). `recipients.gm` dit au client si le message lui est adressé.
 */
export function messageEvent(
  tx: Tx,
  ctx: EventContext,
  v: MessageViewer,
  e: {
    type: 'campaign.message_posted' | 'campaign.message_updated' | 'campaign.message_deleted';
    message: MessageRow;
  },
) {
  const m = e.message;
  const payload: Record<string, unknown> = {
    id: m.id,
    authorId: m.authorId,
    recipients:
      m.whisperRecipients === null ? null : { gm: m.whisperGm, userIds: m.whisperRecipients },
    ...(e.type === 'campaign.message_updated' ? { editedAt: m.editedAt?.toISOString() } : {}),
  };
  let visibility: Visibility = 'public';
  if (m.whisperRecipients !== null) {
    visibility = 'gm_only';
    payload.visibleToUsers = [...new Set([m.authorId, ...m.whisperRecipients])];
  }
  return campaignEvent(tx, ctx, {
    type: e.type,
    campaignId: m.campaignId,
    userId: v.userId,
    role: v.access.role,
    payload,
    visibility,
  });
}
