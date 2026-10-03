/**
 * Module « notes » : les notes des campagnes (le Grimoire de l'ancienne app,
 * legacy Notes.tsx et QuickNotes.tsx, et l'espace Notes du front), privées et
 * partagées. Une note appartient toujours à une campagne. Contrat :
 * docs/api-notes.md.
 *
 *   GET    /v1/notes                               mes notes lisibles, toutes campagnes (pages)
 *   GET    /v1/notes/facets                        compteurs et étiquettes de l'espace Notes
 *   GET    /v1/notes/:noteId                       une note (sans connaître sa campagne)
 *   PATCH  /v1/notes/:noteId                       modifier, partager, changer de campagne
 *   DELETE /v1/notes/:noteId                       supprimer
 *   PUT    /v1/notes/:noteId/pin                   épingler (pour soi)
 *   DELETE /v1/notes/:noteId/pin                   désépingler
 *   GET    /v1/campaigns/:id/notes                 notes lisibles de la campagne (mêmes filtres)
 *   GET    /v1/campaigns/:id/notes/:noteId         une note de la campagne
 *   POST   /v1/campaigns/:id/notes                 créer dans la campagne
 *   PATCH  /v1/campaigns/:id/notes/:noteId         modifier : privée, l'auteur ; partagée, qui la lit
 *   DELETE /v1/campaigns/:id/notes/:noteId         supprimer : mêmes droits
 *
 * Comme l'ancienne app, une note partagée se modifie et se supprime par
 * quiconque la lit ; seul son auteur la rend privée ou la change de campagne
 * (les autres en font une copie par POST). Les spectateurs ne font que lire.
 * Le HTML est assaini par le service à chaque écriture (html.ts).
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { EventContext, Tx } from '../../db/outbox.js';
import { notePins, notes } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { publicBase } from '../../storage/images.js';
import { campaignNotFound } from '../campaigns/repository.js';
import { CampaignId, currentUser, eventContext } from '../schemas.js';
import { BACKFILL_INTERVAL_MS, resanitizeNotes } from './backfill.js';
import {
  campaignReader,
  changedFields,
  contentFields,
  loadNote,
  noteApi,
  noteEvent,
  noteReader,
  noteSummaryApi,
  notNoteOwner,
  pinEvent,
  pinnedAmong,
  playedCharacter,
  requireWriter,
  searchTextOf,
  servedContent,
  shareTargets,
  versionConflict,
  type NoteReader,
  type NoteRow,
} from './common.js';
import { SANITIZER_VERSION, type SanitizeOptions } from './html.js';
import { listNotes, noteFacets } from './list.js';
import {
  LIMITS,
  ListQuery,
  Note,
  NoteFacets,
  NoteId,
  NotePage,
  noteFields,
  sharingFields,
} from './schemas.js';

export { LIMITS } from './schemas.js';

/** Limite par IP des demandes d'URL d'envoi, comme l'image de campagne. */
const UPLOAD_LIMIT = {
  rateLimit: { max: 20, timeWindow: '1 minute' },
} as FastifyContextConfig;

const Params = z.object({ id: CampaignId });
const NoteParams = z.object({ noteId: NoteId });
const CampaignNoteParams = z.object({ id: CampaignId, noteId: NoteId });

const shareRequiresShared = () =>
  HttpError.badRequest(
    'sharedWith et sharedWithGm ne valent que pour une note partagée',
    'share_requires_shared',
  );

const noShareTarget = () =>
  HttpError.badRequest(
    'Partage sans destinataire : des personnages, les MJ ou toute la campagne',
    'invalid_share_target',
  );

const quotaExceeded = () =>
  new HttpError(
    403,
    'Accès refusé',
    'note_quota_exceeded',
    `${LIMITS.notesPerAuthor} notes au plus par auteur : supprimez-en avant d’en créer`,
  );

type Sharing = Pick<NoteRow, 'shared' | 'sharedWith' | 'sharedWithGm'>;
interface SharingRequest {
  shared?: boolean;
  sharedWith?: 'all' | string[];
  sharedWithGm?: boolean;
}

/**
 * Partage demandé, à partir du partage actuel (`prev`, null pour une nouvelle
 * note ou une note qui change de campagne : elle repart privée). Partager sans
 * destinataires vaut « tous », comme l'ancienne app ; avec `sharedWithGm`
 * seul, « les MJ seulement ». Partagée avec tous, elle l'est aussi avec les MJ.
 */
async function resolveSharing(
  tx: Tx,
  campaignId: string,
  prev: Sharing | null,
  req: SharingRequest,
): Promise<Sharing> {
  const shared = req.shared ?? prev?.shared ?? false;
  if (!shared) {
    if (req.sharedWith !== undefined || req.sharedWithGm === true) throw shareRequiresShared();
    return { shared: false, sharedWith: null, sharedWithGm: false };
  }
  let sharedWith: string[] | null;
  if (req.sharedWith !== undefined) sharedWith = await shareTargets(tx, campaignId, req.sharedWith);
  else if (prev?.shared) sharedWith = prev.sharedWith;
  else sharedWith = req.sharedWithGm ? [] : null;
  const sharedWithGm =
    sharedWith !== null && (req.sharedWithGm ?? (prev?.shared ? prev.sharedWithGm : false));
  if (sharedWith !== null && !sharedWith.length && !sharedWithGm) throw noShareTarget();
  return { shared, sharedWith, sharedWithGm };
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const base = publicBase(deps.config.S3_PUBLIC_URL);
  const opts: SanitizeOptions = { imageBase: base };
  const Fields = noteFields(base);
  const FieldsBody = z.strictObject(Fields).partial();
  const SharingBody = z.object(sharingFields).partial().shape;
  const Version = z.number().int().positive();
  const CreateBody = FieldsBody.extend(SharingBody);
  const UpdateBody = FieldsBody.extend(SharingBody).extend({ version: Version.optional() });

  // ─── Reprise des notes importées ───────────────────────────────────────────
  if (deps.config.NODE_ENV !== 'test') {
    let timer: ReturnType<typeof setInterval> | null = null;
    const sweep = () =>
      resanitizeNotes(db, opts).then(
        (n) => n && app.log.info({ notes: n }, 'notes réassainies'),
        (err: unknown) => app.log.error({ err }, 'reprise des notes impossible'),
      );
    app.addHook('onReady', async () => {
      void sweep();
      timer = setInterval(() => void sweep(), BACKFILL_INTERVAL_MS);
      timer.unref();
    });
    app.addHook('onClose', async () => {
      if (timer) clearInterval(timer);
    });
  }

  // ─── Représentation ────────────────────────────────────────────────────────

  async function one(n: NoteRow, reader: NoteReader, authorization: string | undefined) {
    const [profiles, pinned] = await Promise.all([
      deps.profiles.profiles([n.ownerUserId], authorization),
      pinnedAmong(db, reader.userId, [n.id]),
    ]);
    return noteApi(n, reader, profiles, pinned.has(n.id), opts);
  }

  async function page(reader: NoteReader, q: ListQuery, authorization: string | undefined) {
    const result = await listNotes(db, reader, q);
    const profiles = await deps.profiles.profiles(
      [...new Set(result.items.map((i) => i.row.ownerUserId))],
      authorization,
    );
    return {
      items: result.items.map((i) => noteSummaryApi(i.row, reader, profiles, i.pinned, i.excerpt)),
      nextCursor: result.nextCursor,
      total: result.total,
    };
  }

  // ─── Écritures ─────────────────────────────────────────────────────────────

  type CreateInput = z.infer<typeof CreateBody>;
  type UpdateInput = z.infer<typeof UpdateBody> & { campaignId?: string };

  async function createNote(
    tx: Tx,
    ctx: EventContext,
    reader: NoteReader,
    campaignId: string,
    body: CreateInput,
  ): Promise<NoteRow> {
    if (!reader.campaigns.has(campaignId)) throw campaignNotFound();
    requireWriter(reader, campaignId);
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notes)
      .where(eq(notes.ownerUserId, reader.userId));
    if ((count?.n ?? 0) >= LIMITS.notesPerAuthor) throw quotaExceeded();

    const { shared, sharedWith, sharedWithGm, ...fields } = body;
    const sharing = await resolveSharing(tx, campaignId, null, {
      shared,
      sharedWith,
      sharedWithGm,
    });
    const derived = contentFields(fields.content ?? '', opts);
    const searchable = {
      title: fields.title ?? '',
      tags: fields.tags ?? [],
      race: fields.race ?? null,
      class: fields.class ?? null,
      region: fields.region ?? null,
      itemType: fields.itemType ?? null,
      subQuests: fields.subQuests ?? [],
    };
    const [row] = await tx
      .insert(notes)
      .values({
        ...fields,
        ...derived,
        searchText: searchTextOf(searchable, derived.plainText),
        id: uuidv7(),
        campaignId,
        ownerUserId: reader.userId,
        characterId: await playedCharacter(tx, campaignId, reader.userId),
        ...sharing,
      })
      .returning();
    const { plainText: _p, searchText: _s, search: _v, ...note } = row!;
    await noteEvent(tx, ctx, reader, { type: 'note.created', room: campaignId, after: note });
    return note;
  }

  async function updateNote(
    tx: Tx,
    ctx: EventContext,
    reader: NoteReader,
    noteId: string,
    body: UpdateInput,
    scope?: string,
  ): Promise<NoteRow> {
    const stored = await loadNote(tx, reader, noteId, { lock: true, campaignId: scope });
    requireWriter(reader, stored.campaignId);
    const { version, shared, sharedWith, sharedWithGm, campaignId: target, ...fields } = body;
    if (version !== undefined && version !== stored.version) throw versionConflict();
    // Comparaisons et événements sur le contenu tel qu'il est servi (assaini)
    const before = { ...stored, content: servedContent(stored, opts) };
    const mine = before.ownerUserId === reader.userId;

    const moving = target !== undefined && target !== before.campaignId;
    const campaignId = moving ? target : before.campaignId;
    if (moving) {
      if (!mine) throw notNoteOwner('Seul l’auteur change la note de campagne');
      if (!reader.campaigns.has(campaignId)) throw campaignNotFound();
      requireWriter(reader, campaignId);
    }
    // Une note privée n'est lisible que par son auteur : seul lui la partage
    if (before.shared && shared === false && !mine)
      throw notNoteOwner('Seul l’auteur rend privée une note partagée : créez-en une copie');
    const sharing = await resolveSharing(tx, campaignId, moving ? null : before, {
      shared,
      sharedWith,
      sharedWithGm,
    });

    // Contenu réécrit : le nouveau, ou l'ancien s'il date d'un assainisseur antérieur
    const derived =
      fields.content !== undefined
        ? contentFields(fields.content, opts)
        : stored.sanitizerVersion < SANITIZER_VERSION
          ? contentFields(stored.content, opts, true)
          : null;
    let plainText = derived?.plainText;
    if (plainText === undefined) {
      const [p] = await tx
        .select({ plainText: notes.plainText })
        .from(notes)
        .where(eq(notes.id, before.id));
      plainText = p?.plainText ?? '';
    }

    const next = {
      ...before,
      ...fields,
      ...(derived ? { content: derived.content } : {}),
      ...sharing,
      campaignId,
    };
    const changed = changedFields(before, next);
    const rewrite = stored.sanitizerVersion < SANITIZER_VERSION;
    // Rien ne change (et rien à reprendre) : ni écriture, ni version, ni événement
    if (!changed.length && !rewrite) return stored;

    const [row] = await tx
      .update(notes)
      .set({
        ...fields,
        ...derived,
        ...sharing,
        campaignId,
        ...(moving ? { characterId: await playedCharacter(tx, campaignId, reader.userId) } : {}),
        searchText: searchTextOf(next, plainText),
        ...(changed.length ? { version: sql`${notes.version} + 1`, updatedAt: sql`now()` } : {}),
      })
      .where(eq(notes.id, before.id))
      .returning();
    const { plainText: _p, searchText: _s, search: _v, ...after } = row!;
    if (!changed.length) return after;

    const rooms = moving ? [before.campaignId, campaignId] : [campaignId];
    for (const room of rooms)
      await noteEvent(tx, ctx, reader, { type: 'note.updated', room, before, after, changed });
    return after;
  }

  async function deleteNote(
    tx: Tx,
    ctx: EventContext,
    reader: NoteReader,
    noteId: string,
    scope?: string,
  ) {
    // Privée : seul l'auteur la trouve ; partagée : quiconque la lit
    const note = await loadNote(tx, reader, noteId, { lock: true, campaignId: scope });
    requireWriter(reader, note.campaignId);
    await tx.delete(notes).where(eq(notes.id, note.id));
    await noteEvent(tx, ctx, reader, {
      type: 'note.deleted',
      room: note.campaignId,
      before: note,
    });
  }

  // ─── Toutes mes notes ──────────────────────────────────────────────────────

  r.get(
    '/v1/notes',
    { ...auth, schema: { querystring: ListQuery, response: { 200: NotePage } } },
    async (req) => {
      const reader = await noteReader(db, currentUser(req));
      return page(reader, req.query, req.headers.authorization);
    },
  );

  r.get('/v1/notes/facets', { ...auth, schema: { response: { 200: NoteFacets } } }, async (req) =>
    noteFacets(db, await noteReader(db, currentUser(req))),
  );

  r.get(
    '/v1/notes/:noteId',
    { ...auth, schema: { params: NoteParams, response: { 200: Note } } },
    async (req) => {
      const reader = await noteReader(db, currentUser(req));
      return one(await loadNote(db, reader, req.params.noteId), reader, req.headers.authorization);
    },
  );

  r.patch(
    '/v1/notes/:noteId',
    {
      ...auth,
      schema: {
        params: NoteParams,
        body: UpdateBody.extend({ campaignId: CampaignId.optional() }),
        response: { 200: Note },
      },
    },
    async (req) => {
      const reader = await noteReader(db, currentUser(req));
      const note = await db.transaction((tx) =>
        updateNote(tx, eventContext(req), reader, req.params.noteId, req.body),
      );
      return one(note, reader, req.headers.authorization);
    },
  );

  r.delete('/v1/notes/:noteId', { ...auth, schema: { params: NoteParams } }, async (req, reply) => {
    const reader = await noteReader(db, currentUser(req));
    await db.transaction((tx) => deleteNote(tx, eventContext(req), reader, req.params.noteId));
    reply.code(204);
  });

  r.put(
    '/v1/notes/:noteId/pin',
    { ...auth, schema: { params: NoteParams } },
    async (req, reply) => {
      const reader = await noteReader(db, currentUser(req));
      await db.transaction(async (tx) => {
        const note = await loadNote(tx, reader, req.params.noteId);
        const pinned = await tx
          .insert(notePins)
          .values({ userId: reader.userId, noteId: note.id })
          .onConflictDoNothing()
          .returning({ id: notePins.noteId });
        if (pinned.length) await pinEvent(tx, eventContext(req), reader.userId, note.id, true);
      });
      reply.code(204);
    },
  );

  r.delete(
    '/v1/notes/:noteId/pin',
    { ...auth, schema: { params: NoteParams } },
    async (req, reply) => {
      const reader = await noteReader(db, currentUser(req));
      await db.transaction(async (tx) => {
        const note = await loadNote(tx, reader, req.params.noteId);
        const unpinned = await tx
          .delete(notePins)
          .where(and(eq(notePins.userId, reader.userId), eq(notePins.noteId, note.id)))
          .returning({ id: notePins.noteId });
        if (unpinned.length) await pinEvent(tx, eventContext(req), reader.userId, note.id, false);
      });
      reply.code(204);
    },
  );

  // ─── Notes d'une campagne ──────────────────────────────────────────────────

  r.get(
    '/v1/campaigns/:id/notes',
    {
      ...auth,
      schema: {
        params: Params,
        querystring: ListQuery.omit({ campaignId: true }),
        response: { 200: NotePage },
      },
    },
    async (req) => {
      const reader = await campaignReader(db, req.params.id, currentUser(req));
      return page(reader, { ...req.query, campaignId: req.params.id }, req.headers.authorization);
    },
  );

  r.get(
    '/v1/campaigns/:id/notes/:noteId',
    { ...auth, schema: { params: CampaignNoteParams, response: { 200: Note } } },
    async (req) => {
      const reader = await campaignReader(db, req.params.id, currentUser(req));
      const note = await loadNote(db, reader, req.params.noteId, { campaignId: req.params.id });
      return one(note, reader, req.headers.authorization);
    },
  );

  r.post(
    '/v1/campaigns/:id/notes',
    { ...auth, schema: { params: Params, body: CreateBody, response: { 201: Note } } },
    async (req, reply) => {
      const userId = currentUser(req);
      const note = await db.transaction(async (tx) => {
        const reader = await campaignReader(tx, req.params.id, userId);
        return createNote(tx, eventContext(req), reader, req.params.id, req.body);
      });
      reply.code(201);
      return one(note, await campaignReader(db, req.params.id, userId), req.headers.authorization);
    },
  );

  r.patch(
    '/v1/campaigns/:id/notes/:noteId',
    {
      ...auth,
      schema: { params: CampaignNoteParams, body: UpdateBody, response: { 200: Note } },
    },
    async (req) => {
      const userId = currentUser(req);
      const reader = await campaignReader(db, req.params.id, userId);
      const note = await db.transaction((tx) =>
        updateNote(tx, eventContext(req), reader, req.params.noteId, req.body, req.params.id),
      );
      return one(note, reader, req.headers.authorization);
    },
  );

  r.delete(
    '/v1/campaigns/:id/notes/:noteId',
    { ...auth, schema: { params: CampaignNoteParams } },
    async (req, reply) => {
      const reader = await campaignReader(db, req.params.id, currentUser(req));
      await db.transaction((tx) =>
        deleteNote(tx, eventContext(req), reader, req.params.noteId, req.params.id),
      );
      reply.code(204);
    },
  );
};
