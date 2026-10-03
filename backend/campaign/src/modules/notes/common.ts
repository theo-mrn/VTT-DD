/**
 * Socle du module « notes » : qui lit quoi, ce qu'on peut en faire,
 * représentation API, champs calculés et événements. Une note appartient
 * toujours à une campagne.
 *
 * Lecture (reprise de loadNotes, legacy/src/components/Notes.tsx), dans une
 * campagne dont on est membre : ses propres notes, privées ou partagées, les
 * notes partagées avec tous (`sharedWith` null, legacy `'all'`), celles
 * partagées avec un de ses personnages (propriétaire ou incarné), et, pour un
 * MJ, celles partagées avec les MJ (`sharedWithGm`).
 * Le MJ n'a aucun autre droit : l'ancienne app ne lui montrait ni les notes
 * privées des joueurs, ni les notes partagées avec d'autres personnages que les
 * siens. Une note qu'on ne peut pas lire est introuvable (404).
 *
 * Événements : jamais le texte ni les étapes (le journal history est en ajout
 * seul, il ne doit pas figer le contenu des notes), voir `noteEvent`.
 */
import { deepEqual, type Visibility } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, getTableColumns, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Profile } from '../../clients/profiles.js';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import {
  campaignCharacters,
  campaignMembers,
  notePins,
  notes,
  type NoteSubQuest,
  type NoteTag,
  type Role,
} from '../../db/schema.js';
import { access, actorRole, userApi } from '../campaigns/repository.js';
import {
  PREVIEW_LENGTH,
  SANITIZER_VERSION,
  sanitizeNoteHtml,
  searchForm,
  type SanitizeOptions,
} from './html.js';
import { LIMITS } from './schemas.js';

// ─── Lignes ──────────────────────────────────────────────────────────────────

/** Colonnes lues par le service : sans le texte brut ni les données de recherche. */
const { plainText: _plain, searchText: _search, search: _vector, ...rest } = getTableColumns(notes);
export const NOTE_COLUMNS = rest;
export type NoteRow = Omit<typeof notes.$inferSelect, 'plainText' | 'searchText' | 'search'>;

// ─── Lecteur ─────────────────────────────────────────────────────────────────

/** Appelant, et ses campagnes (avec son rôle) : ce qui décide de ce qu'il lit. */
export interface NoteReader {
  userId: string;
  campaigns: Map<string, Role>;
}

/** Lecteur de toutes ses notes : ses campagnes sont celles dont il est membre. */
export async function noteReader(db: Db | Tx, userId: string): Promise<NoteReader> {
  const rows = await db
    .select({ campaignId: campaignMembers.campaignId, role: campaignMembers.role })
    .from(campaignMembers)
    .where(eq(campaignMembers.userId, userId));
  return { userId, campaigns: new Map(rows.map((r) => [r.campaignId, r.role])) };
}

/** Lecteur des notes d'une campagne : 404 `campaign_not_found` s'il n'en est pas membre. */
export async function campaignReader(
  db: Db | Tx,
  campaignId: string,
  userId: string,
): Promise<NoteReader> {
  const a = await access(db, campaignId, userId);
  return { userId, campaigns: new Map([[a.campaign.id, a.role]]) };
}

/** Rôle de l'appelant dans la campagne, null s'il n'en est pas membre. */
export const roleIn = (r: NoteReader, campaignId: string) => r.campaigns.get(campaignId) ?? null;

export const noteNotFound = () =>
  new HttpError(404, 'Ressource introuvable', 'note_not_found', 'Note introuvable');

export const versionConflict = () =>
  HttpError.conflict('La note a été modifiée entre-temps : rechargez-la', 'version_conflict');

export const notNoteOwner = (detail: string) =>
  new HttpError(403, 'Accès refusé', 'not_note_owner', detail);

/** Tableau d'uuid pour `&&` et `= any(…)`. */
const sqlUuids = (ids: string[]) => sql`${`{${ids.join(',')}}`}::uuid[]`;

/** Condition SQL : notes de ses campagnes lisibles par l'appelant. */
export function readableBy(r: NoteReader): SQL {
  const ids = [...r.campaigns.keys()];
  if (!ids.length) return sql`false`;
  const gm = ids.filter((id) => r.campaigns.get(id) === 'gm');
  const sharedToMe = or(
    isNull(notes.sharedWith),
    gm.length
      ? and(eq(notes.sharedWithGm, true), sql`${notes.campaignId} = any(${sqlUuids(gm)})`)
      : undefined,
    sql`exists (select 1 from ${campaignCharacters} cc where cc.campaign_id = ${notes.campaignId}
      and cc.character_id = any(${notes.sharedWith})
      and (cc.owner_id = ${r.userId} or cc.played_by = ${r.userId}))`,
  );
  return and(
    sql`${notes.campaignId} = any(${sqlUuids(ids)})`,
    or(eq(notes.ownerUserId, r.userId), and(eq(notes.shared, true), sharedToMe)),
  )!;
}

/**
 * Note lisible par l'appelant (verrouillée si `lock`), sinon 404. `campaignId` :
 * routes d'une campagne, la note doit en être.
 */
export async function loadNote(
  db: Db | Tx,
  r: NoteReader,
  noteId: string,
  o: { lock?: boolean; campaignId?: string } = {},
): Promise<NoteRow> {
  const query = db
    .select(NOTE_COLUMNS)
    .from(notes)
    .where(
      and(
        eq(notes.id, noteId),
        o.campaignId ? eq(notes.campaignId, o.campaignId) : undefined,
        readableBy(r),
      ),
    );
  const [note] = o.lock ? await query.for('update') : await query;
  if (!note) throw noteNotFound();
  return note;
}

// ─── Droits ──────────────────────────────────────────────────────────────────

export interface NotePermissions {
  edit: boolean;
  delete: boolean;
  share: boolean;
  move: boolean;
}

/**
 * Ce que l'appelant (qui lit la note) peut en faire. Comme l'ancienne app, une
 * note partagée se modifie et se supprime par quiconque la lit ; seul son
 * auteur la rend privée ou la change de campagne. Les spectateurs lisent.
 */
export function permissionsOf(n: NoteRow, r: NoteReader): NotePermissions {
  const mine = n.ownerUserId === r.userId;
  const role = roleIn(r, n.campaignId);
  const writer = role !== null && role !== 'spectator';
  return { edit: writer, delete: writer, share: writer && mine, move: writer && mine };
}

/** Écrire dans la campagne (ses notes) : 403 pour un spectateur. */
export function requireWriter(r: NoteReader, campaignId: string) {
  if (roleIn(r, campaignId) === 'spectator')
    throw HttpError.forbidden('Un spectateur n’écrit pas de notes');
}

/** Personnage incarné par l'appelant dans la campagne (legacy persoId), ou null. */
export async function playedCharacter(db: Db | Tx, campaignId: string, userId: string) {
  const [row] = await db
    .select({ id: campaignCharacters.characterId })
    .from(campaignCharacters)
    .where(
      and(eq(campaignCharacters.campaignId, campaignId), eq(campaignCharacters.playedBy, userId)),
    );
  return row?.id ?? null;
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
  if (!ids.length) return [];
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

/** Épingles de l'appelant parmi ces notes. */
export async function pinnedAmong(db: Db | Tx, userId: string, noteIds: string[]) {
  if (!noteIds.length) return new Set<string>();
  const rows = await db
    .select({ id: notePins.noteId })
    .from(notePins)
    .where(and(eq(notePins.userId, userId), inArray(notePins.noteId, noteIds)));
  return new Set(rows.map((r) => r.id));
}

// ─── Champs calculés ─────────────────────────────────────────────────────────

/** Échappe du texte brut en HTML (repli d'une note trop longue une fois réécrite). */
const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * Contenu assaini et champs qui en découlent. Le HTML réécrit peut dépasser la
 * limite (encodage) : 400 à l'écriture ; pour une note importée (`fallback`),
 * son texte seul, en un paragraphe.
 */
export function contentFields(html: string, opts: SanitizeOptions, fallback = false) {
  const s = sanitizeNoteHtml(html, opts);
  let content = s.html;
  if (content.length > LIMITS.content) {
    if (!fallback)
      throw HttpError.badRequest(
        `content : ${LIMITS.content} caractères au plus une fois mis en forme`,
        'content_too_long',
      );
    let escaped = escapeHtml(s.text).slice(0, LIMITS.content - 7);
    // Pas d'entité coupée en deux
    const amp = escaped.lastIndexOf('&');
    if (amp > escaped.length - 6 && !escaped.slice(amp).includes(';'))
      escaped = escaped.slice(0, amp);
    content = `<p>${escaped}</p>`;
  }
  return {
    content,
    plainText: s.text.slice(0, LIMITS.content),
    preview: s.preview.slice(0, PREVIEW_LENGTH + 1),
    sanitizerVersion: SANITIZER_VERSION,
  };
}

/** Champs d'une note qui entrent dans la recherche. */
export interface Searchable {
  title: string;
  tags: NoteTag[];
  race: string | null;
  class: string | null;
  region: string | null;
  itemType: string | null;
  subQuests: NoteSubQuest[];
}

/** Forme de recherche : titre, étiquettes, détails, étapes et texte, sans accents. */
export function searchTextOf(n: Searchable, plainText: string): string {
  const parts = [
    n.title,
    n.tags.map((t) => t.label).join(' '),
    n.race,
    n.class,
    n.region,
    n.itemType,
    n.subQuests.map((q) => q.title).join(' '),
    plainText,
  ];
  return searchForm(parts.filter(Boolean).join('\n')).slice(0, 300_000);
}

/** Contenu servi : réassaini à la volée pour une note pas encore reprise (importée). */
export const servedContent = (n: NoteRow, opts: SanitizeOptions) =>
  n.sanitizerVersion >= SANITIZER_VERSION
    ? n.content
    : contentFields(n.content, opts, true).content;

// ─── Représentation API ──────────────────────────────────────────────────────

/** `sharedWith` de l'API : null pour une note privée, `'all'` ou des personnages sinon. */
export const sharedWithApi = (n: Pick<NoteRow, 'shared' | 'sharedWith'>) =>
  n.shared ? (n.sharedWith ?? ('all' as const)) : null;

function commonApi(n: NoteRow, r: NoteReader, profiles: Map<string, Profile>, pinned: boolean) {
  return {
    id: n.id,
    campaignId: n.campaignId,
    owner: userApi(n.ownerUserId, profiles),
    characterId: n.characterId,
    shared: n.shared,
    sharedWith: sharedWithApi(n),
    sharedWithGm: n.sharedWithGm,
    title: n.title,
    icon: n.icon,
    type: n.type,
    tags: n.tags,
    imageUrl: n.imageUrl,
    pinned,
    permissions: permissionsOf(n, r),
    version: n.version,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

export const noteApi = (
  n: NoteRow,
  r: NoteReader,
  profiles: Map<string, Profile>,
  pinned: boolean,
  opts: SanitizeOptions,
) => ({
  ...commonApi(n, r, profiles, pinned),
  content: servedContent(n, opts),
  race: n.race,
  class: n.class,
  region: n.region,
  itemType: n.itemType,
  questType: n.questType,
  questStatus: n.questStatus,
  subQuests: n.subQuests,
});

export const noteSummaryApi = (
  n: NoteRow,
  r: NoteReader,
  profiles: Map<string, Profile>,
  pinned: boolean,
  excerpt: string,
) => ({ ...commonApi(n, r, profiles, pinned), excerpt });

/** Champs modifiables, comparés pour `changed` de note.updated. */
const EDITABLE = [
  'campaignId',
  'title',
  'content',
  'icon',
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
  'sharedWithGm',
] as const satisfies readonly (keyof NoteRow)[];

/** Noms des champs qui ont changé (sans leurs valeurs). */
export const changedFields = (before: NoteRow, after: NoteRow): string[] =>
  EDITABLE.filter((k) => !deepEqual(before[k], after[k]));

// ─── Événements ──────────────────────────────────────────────────────────────

/** Qui lit la note : l'auteur seul, des personnages ou les MJ choisis, ou toute la campagne. */
type Audience = 'owner' | 'targeted' | 'all';
const audienceOf = (n: NoteRow): Audience =>
  !n.shared ? 'owner' : n.sharedWith === null ? 'all' : 'targeted';

/** Utilisateurs (propriétaires ou incarnateurs) des personnages donnés : même règle que `readableBy`. */
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
 * Événement de note, dans la transaction de la donnée, pour la campagne
 * `room` (celle de la note ; les deux, l'une après l'autre, quand elle change
 * de campagne). Le payload ne porte jamais le texte (`content`) ni
 * les étapes : l'id, l'auteur, la campagne, le partage, la version, les noms
 * des champs modifiés (`changed`, sans valeurs), et le titre quand la note est
 * partagée avec toute cette campagne. Visibilité, calculée sur l'état avant ET
 * après dans cette campagne (celui qui perd l'accès doit l'apprendre) :
 *  - lue par toute la campagne → `public` ;
 *  - sinon partagée avec des personnages ou les MJ → `gm_only` +
 *    `visibleToUsers` (leurs joueurs, l'auteur et l'acteur) : seul moyen de
 *    toucher ces joueurs en temps réel ; le MJ reçoit l'id et le partage,
 *    jamais le titre ;
 *  - sinon privée → `owner` (l'auteur, seul à agir dessus).
 */
export async function noteEvent(
  tx: Tx,
  ctx: EventContext,
  r: NoteReader,
  e: {
    type: 'note.created' | 'note.updated' | 'note.deleted';
    room: string;
    before?: NoteRow;
    after?: NoteRow;
    changed?: string[];
  },
) {
  const current = (e.after ?? e.before)!;
  const states = [e.before, e.after].filter((n): n is NoteRow => !!n && n.campaignId === e.room);
  const audiences = states.map(audienceOf);
  const payload: Record<string, unknown> = {
    id: current.id,
    ownerId: current.ownerUserId,
    campaignId: current.campaignId,
    characterId: current.characterId,
    shared: current.shared,
    sharedWith: sharedWithApi(current),
    sharedWithGm: current.sharedWithGm,
    version: current.version,
    ...(current.campaignId === e.room && audienceOf(current) === 'all'
      ? { title: current.title }
      : {}),
    ...(e.changed ? { changed: e.changed } : {}),
  };
  let visibility: Visibility = 'owner';
  if (audiences.includes('all')) visibility = 'public';
  else if (audiences.includes('targeted')) {
    visibility = 'gm_only';
    const characterIds = [...new Set(states.flatMap((s) => s.sharedWith ?? []))];
    const users = await usersOfCharacters(tx, e.room, characterIds);
    payload.visibleToUsers = [
      ...new Set([...users, ...states.map((s) => s.ownerUserId), r.userId]),
    ];
  }
  const role = roleIn(r, e.room);
  return appendEvent(tx, ctx, {
    type: e.type,
    campaignId: e.room,
    actor: {
      userId: r.userId,
      role: actorRole(role),
      characterId: await playedCharacter(tx, e.room, r.userId),
    },
    aggregate: { type: 'note', id: current.id },
    payload,
    visibility,
  });
}

/** Épingle posée ou retirée : événement personnel (hors campagne), pour les autres onglets. */
export function pinEvent(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  noteId: string,
  pinned: boolean,
) {
  return appendEvent(tx, ctx, {
    type: pinned ? 'note.pinned' : 'note.unpinned',
    campaignId: null,
    actor: { userId, role: 'user', characterId: null },
    aggregate: { type: 'note', id: noteId },
    payload: { id: noteId },
    visibility: 'owner',
  });
}
