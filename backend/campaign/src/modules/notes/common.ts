/**
 * Socle du module « notes » : qui lit quoi, représentation API et événements.
 *
 * Lecture, reprise de loadNotes (legacy/src/components/Notes.tsx) :
 *  - ses propres notes, privées ou partagées ;
 *  - les notes partagées avec tous (`sharedWith` null, legacy `'all'`) ;
 *  - les notes partagées avec un de ses personnages (propriétaire ou incarné).
 * Le MJ n'a aucun droit de plus : l'ancienne app ne lui montrait ni les notes
 * privées des joueurs, ni les notes partagées avec d'autres personnages que les
 * siens. Une note qu'on ne peut pas lire est introuvable (404).
 *
 * Événements : jamais le texte ni les étapes (le journal history est en ajout
 * seul, il ne doit pas figer le contenu des notes), voir `noteEvent`.
 */
import { deepEqual, type Visibility } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Profile } from '../../clients/profiles.js';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { campaignCharacters, notes } from '../../db/schema.js';
import { access, actorRole, userApi, type Access } from '../campaigns/repository.js';

export type NoteRow = typeof notes.$inferSelect;

/** Appelant et ce qui décide de ce qu'il lit. */
export interface NoteViewer {
  access: Access;
  userId: string;
  /** Personnages dont il est propriétaire ou qu'il incarne dans la campagne. */
  characterIds: string[];
  /** Personnage qu'il incarne : auteur des notes qu'il écrit (legacy persoId), ou null. */
  playedCharacterId: string | null;
}

export async function noteViewer(
  db: Db | Tx,
  campaignId: string,
  userId: string,
): Promise<NoteViewer> {
  const a = await access(db, campaignId, userId);
  const own = await db
    .select({ id: campaignCharacters.characterId, playedBy: campaignCharacters.playedBy })
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, a.campaign.id),
        or(eq(campaignCharacters.ownerId, userId), eq(campaignCharacters.playedBy, userId)),
      ),
    );
  return {
    access: a,
    userId,
    characterIds: own.map((c) => c.id),
    playedCharacterId: own.find((c) => c.playedBy === userId)?.id ?? null,
  };
}

export const noteNotFound = () =>
  new HttpError(404, 'Ressource introuvable', 'note_not_found', 'Note introuvable');

export const versionConflict = () =>
  HttpError.conflict('La note a été modifiée entre-temps : rechargez-la', 'version_conflict');

/** Les spectateurs lisent les notes partagées avec tous, sans écrire. */
export function requireWriter(v: NoteViewer) {
  if (v.access.role === 'spectator')
    throw HttpError.forbidden('Un spectateur n’écrit pas de notes');
}

/** Tableau d'uuid pour `&&` et `= any(…)`. */
const sqlUuids = (ids: string[]) => sql`${`{${ids.join(',')}}`}::uuid[]`;

/** Condition SQL : notes de la campagne lisibles par l'appelant. */
export function readableBy(v: NoteViewer): SQL {
  const sharedToMe = v.characterIds.length
    ? or(isNull(notes.sharedWith), sql`${notes.sharedWith} && ${sqlUuids(v.characterIds)}`)
    : isNull(notes.sharedWith);
  return and(
    eq(notes.campaignId, v.access.campaign.id),
    or(eq(notes.ownerUserId, v.userId), and(eq(notes.shared, true), sharedToMe)),
  )!;
}

/** Même règle que `readableBy`, pour une note déjà chargée. */
export const canRead = (n: NoteRow, v: NoteViewer) =>
  n.ownerUserId === v.userId ||
  (n.shared && (n.sharedWith === null || n.sharedWith.some((id) => v.characterIds.includes(id))));

/** Note de la campagne lisible par l'appelant (verrouillée si `lock`), sinon 404. */
export async function loadNote(db: Db | Tx, v: NoteViewer, noteId: string, lock = false) {
  const query = db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.campaignId, v.access.campaign.id)));
  const [note] = lock ? await query.for('update') : await query;
  if (!note || !canRead(note, v)) throw noteNotFound();
  return note;
}

/**
 * Destinataires d'une note partagée : `'all'` → null, sinon des personnages
 * engagés dans la campagne (dédoublonnés), 400 pour un personnage inconnu.
 */
export async function shareTargets(
  tx: Tx,
  campaignId: string,
  sharedWith: 'all' | string[],
): Promise<string[] | null> {
  if (sharedWith === 'all') return null;
  const ids = [...new Set(sharedWith)];
  const found = await tx
    .select({ id: campaignCharacters.characterId })
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignId),
        inArray(campaignCharacters.characterId, ids),
      ),
    );
  if (found.length !== ids.length)
    throw HttpError.badRequest(
      'sharedWith : personnage absent de la campagne',
      'invalid_share_target',
    );
  return ids;
}

// ─── Représentation API ──────────────────────────────────────────────────────

/** `sharedWith` de l'API : null pour une note privée, `'all'` ou des personnages sinon. */
export const sharedWithApi = (n: Pick<NoteRow, 'shared' | 'sharedWith'>) =>
  n.shared ? (n.sharedWith ?? ('all' as const)) : null;

export const noteApi = (n: NoteRow, profiles: Map<string, Profile>) => ({
  id: n.id,
  owner: userApi(n.ownerUserId, profiles),
  characterId: n.characterId,
  shared: n.shared,
  sharedWith: sharedWithApi(n),
  title: n.title,
  content: n.content,
  type: n.type,
  tags: n.tags,
  imageUrl: n.imageUrl,
  race: n.race,
  class: n.class,
  region: n.region,
  itemType: n.itemType,
  questType: n.questType,
  questStatus: n.questStatus,
  subQuests: n.subQuests,
  version: n.version,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
});

/** Champs modifiables, comparés pour `changed` de note.updated. */
const EDITABLE = [
  'title',
  'content',
  'type',
  'tags',
  'imageUrl',
  'race',
  'class',
  'region',
  'itemType',
  'questType',
  'questStatus',
  'subQuests',
  'shared',
  'sharedWith',
] as const satisfies readonly (keyof NoteRow)[];

/** Noms des champs qui ont changé (sans leurs valeurs). */
export const changedFields = (before: NoteRow, after: NoteRow): string[] =>
  EDITABLE.filter((k) => !deepEqual(before[k], after[k]));

// ─── Événements ──────────────────────────────────────────────────────────────

/** Qui lit la note : l'auteur seul, des personnages choisis, ou toute la campagne. */
type Audience = 'owner' | 'targeted' | 'all';
const audienceOf = (n: NoteRow): Audience =>
  !n.shared ? 'owner' : n.sharedWith === null ? 'all' : 'targeted';

/** Utilisateurs (propriétaires ou incarnateurs) des personnages donnés : même règle que `noteViewer`. */
async function usersOfCharacters(tx: Tx, campaignId: string, characterIds: string[]) {
  if (!characterIds.length) return [];
  const rows = await tx
    .select({ ownerId: campaignCharacters.ownerId, playedBy: campaignCharacters.playedBy })
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignId),
        sql`${campaignCharacters.characterId} = any(${sqlUuids(characterIds)})`,
      ),
    );
  return rows.flatMap((r) => (r.playedBy ? [r.ownerId, r.playedBy] : [r.ownerId]));
}

/**
 * Événement de note, dans la transaction de la donnée. Le payload ne porte
 * jamais le texte (`content`) ni les étapes : seulement l'id, l'auteur, le
 * partage, les noms des champs modifiés (`changed`, sans valeurs) et le titre
 * quand la note est partagée avec tous. Visibilité, calculée sur l'état avant
 * ET après (celui qui perd l'accès doit l'apprendre) :
 *  - lue par toute la campagne avant ou après → `public` ;
 *  - sinon partagée avec des personnages → `gm_only` + `visibleToUsers` (leurs
 *    joueurs, l'auteur et l'acteur) : seul moyen de toucher ces joueurs en temps
 *    réel ; le MJ reçoit l'id et le partage, jamais le titre ;
 *  - sinon privée → `owner` (l'auteur, seul à agir sur sa note privée).
 */
export async function noteEvent(
  tx: Tx,
  ctx: EventContext,
  v: NoteViewer,
  e: {
    type: 'note.created' | 'note.updated' | 'note.deleted';
    before?: NoteRow;
    after?: NoteRow;
    changed?: string[];
  },
) {
  const current = (e.after ?? e.before)!;
  const states = [e.before, e.after].filter((n): n is NoteRow => !!n);
  const audiences = states.map(audienceOf);
  const payload: Record<string, unknown> = {
    id: current.id,
    ownerId: current.ownerUserId,
    characterId: current.characterId,
    shared: current.shared,
    sharedWith: sharedWithApi(current),
    ...(audienceOf(current) === 'all' ? { title: current.title } : {}),
    ...(e.changed ? { changed: e.changed } : {}),
  };
  let visibility: Visibility = 'owner';
  if (audiences.includes('all')) visibility = 'public';
  else if (audiences.includes('targeted')) {
    visibility = 'gm_only';
    const characterIds = [...new Set(states.flatMap((s) => s.sharedWith ?? []))];
    const users = await usersOfCharacters(tx, current.campaignId, characterIds);
    payload.visibleToUsers = [
      ...new Set([...users, ...states.map((s) => s.ownerUserId), v.userId]),
    ];
  }
  return appendEvent(tx, ctx, {
    type: e.type,
    campaignId: current.campaignId,
    actor: {
      userId: v.userId,
      role: actorRole(v.access.role),
      characterId: v.playedCharacterId,
    },
    aggregate: { type: 'note', id: current.id },
    payload,
    visibility,
  });
}
