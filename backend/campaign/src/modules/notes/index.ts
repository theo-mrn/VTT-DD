/**
 * Module « notes » : le Grimoire de la campagne (legacy Notes.tsx et
 * QuickNotes.tsx), notes privées et partagées. Contrat : docs/api-notes.md.
 *
 *   GET    /v1/campaigns/:id/notes                notes lisibles par l'appelant (récentes d'abord)
 *   GET    /v1/campaigns/:id/notes/:noteId        une note
 *   POST   /v1/campaigns/:id/notes                créer (auteur : l'appelant et son personnage incarné)
 *   PATCH  /v1/campaigns/:id/notes/:noteId        modifier : privée, l'auteur ; partagée, qui la lit
 *   DELETE /v1/campaigns/:id/notes/:noteId        supprimer : mêmes droits
 *   POST   /v1/campaigns/:id/notes/upload         URL d'envoi d'une image de note (rien d'écrit)
 *
 * Comme l'ancienne app, une note partagée se modifie et se supprime par
 * quiconque la lit ; seul son auteur la rend privée (les autres en font une
 * copie privée par POST). Les spectateurs ne font que lire.
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NOTE_TYPES, notes, QUEST_STATUSES, QUEST_TYPES } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  imageKey,
  publicBase,
  UPLOAD_EXPIRY,
} from '../../storage/images.js';
import { CampaignId, currentUser, eventContext, UserRef, Uuid } from '../schemas.js';
import {
  changedFields,
  loadNote,
  noteApi,
  noteEvent,
  noteViewer,
  readableBy,
  requireWriter,
  shareTargets,
  versionConflict,
  type NoteRow,
} from './common.js';

/** Bornes (contraintes de 0009-notes.sql). */
export const LIMITS = {
  title: 200,
  content: 200_000,
  detail: 200,
  tags: 50,
  subQuests: 100,
  sharedWith: 100,
} as const;

/** Limite par IP des demandes d'URL d'envoi, comme l'image de campagne. */
const UPLOAD_LIMIT = {
  rateLimit: { max: 20, timeWindow: '1 minute' },
} as FastifyContextConfig;

const NoteId = Uuid('Identifiant de note invalide');
const Params = z.object({ id: CampaignId });
const NoteParams = z.object({ id: CampaignId, noteId: NoteId });

/** Image d'en-tête : URL https ou chemin absolu du site (comme les médias de la carte). */
const ImageUrl = z
  .string()
  .trim()
  .max(2048, '2048 caractères au plus')
  .refine((u) => /^https:\/\/\S+$/.test(u) || /^\/[^/]\S*$/.test(u), {
    message: 'URL https ou chemin absolu attendu',
  });

const Tag = z.strictObject({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(100),
});

const SubQuest = z.strictObject({
  id: z.string().trim().min(1).max(100),
  title: z.string().max(500),
  description: z.string().max(5000),
  status: z.enum(QUEST_STATUSES),
});

const Detail = z.string().trim().max(LIMITS.detail).nullable();

const NoteFields = {
  title: z.string().trim().max(LIMITS.title, `${LIMITS.title} caractères au plus`),
  content: z.string().max(LIMITS.content, `${LIMITS.content} caractères au plus`),
  type: z.enum(NOTE_TYPES),
  tags: z.array(Tag).max(LIMITS.tags),
  imageUrl: ImageUrl.nullable(),
  race: Detail,
  class: Detail,
  region: Detail,
  itemType: Detail,
  questType: z.enum(QUEST_TYPES).nullable(),
  questStatus: z.enum(QUEST_STATUSES).nullable(),
  subQuests: z.array(SubQuest).max(LIMITS.subQuests),
};

/** Destinataires : tous (`'all'`) ou des personnages engagés dans la campagne. */
const SharedWith = z.union([
  z.literal('all'),
  z.array(Uuid('Identifiant de personnage invalide')).min(1).max(LIMITS.sharedWith),
]);

const Note = z.object({
  id: z.string(),
  owner: UserRef,
  characterId: z.string().nullable(),
  shared: z.boolean(),
  sharedWith: z.union([z.literal('all'), z.array(z.string())]).nullable(),
  title: z.string(),
  content: z.string(),
  type: z.enum(NOTE_TYPES),
  tags: z.array(z.object({ id: z.string(), label: z.string() })),
  imageUrl: z.string().nullable(),
  race: z.string().nullable(),
  class: z.string().nullable(),
  region: z.string().nullable(),
  itemType: z.string().nullable(),
  questType: z.enum(QUEST_TYPES).nullable(),
  questStatus: z.enum(QUEST_STATUSES).nullable(),
  subQuests: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      status: z.enum(QUEST_STATUSES),
    }),
  ),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const storageUnavailable = () =>
  new HttpError(
    503,
    'Service indisponible',
    'storage_unavailable',
    'L’envoi d’images n’est pas configuré sur ce serveur',
  );

const shareRequiresShared = () =>
  HttpError.badRequest('sharedWith ne vaut que pour une note partagée', 'share_requires_shared');

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const base = publicBase(deps.config.S3_PUBLIC_URL);

  async function notesApi(rows: NoteRow[], authorization: string | undefined) {
    const profiles = await deps.profiles.profiles(
      [...new Set(rows.map((n) => n.ownerUserId))],
      authorization,
    );
    return rows.map((n) => noteApi(n, profiles));
  }

  r.get(
    '/v1/campaigns/:id/notes',
    { ...auth, schema: { params: Params, response: { 200: z.array(Note) } } },
    async (req) => {
      const v = await noteViewer(db, req.params.id, currentUser(req));
      const rows = await db
        .select()
        .from(notes)
        .where(readableBy(v))
        .orderBy(desc(notes.updatedAt), desc(notes.id));
      return notesApi(rows, req.headers.authorization);
    },
  );

  r.get(
    '/v1/campaigns/:id/notes/:noteId',
    { ...auth, schema: { params: NoteParams, response: { 200: Note } } },
    async (req) => {
      const v = await noteViewer(db, req.params.id, currentUser(req));
      const note = await loadNote(db, v, req.params.noteId);
      return (await notesApi([note], req.headers.authorization))[0]!;
    },
  );

  r.post(
    '/v1/campaigns/:id/notes',
    {
      ...auth,
      schema: {
        params: Params,
        body: z
          .strictObject(NoteFields)
          .partial()
          .extend({ shared: z.boolean().default(false), sharedWith: SharedWith.optional() }),
        response: { 201: Note },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const note = await db.transaction(async (tx) => {
        const v = await noteViewer(tx, req.params.id, userId);
        requireWriter(v);
        const { shared, sharedWith, ...fields } = req.body;
        if (sharedWith !== undefined && !shared) throw shareRequiresShared();
        const [row] = await tx
          .insert(notes)
          .values({
            ...fields,
            id: uuidv7(),
            campaignId: v.access.campaign.id,
            ownerUserId: userId,
            characterId: v.playedCharacterId,
            shared,
            // Comme l'ancienne app : une note partagée sans destinataires l'est avec tous
            sharedWith: shared
              ? await shareTargets(tx, v.access.campaign.id, sharedWith ?? 'all')
              : null,
          })
          .returning();
        await noteEvent(tx, eventContext(req), v, { type: 'note.created', after: row! });
        return row!;
      });
      reply.code(201);
      return (await notesApi([note], req.headers.authorization))[0]!;
    },
  );

  r.patch(
    '/v1/campaigns/:id/notes/:noteId',
    {
      ...auth,
      schema: {
        params: NoteParams,
        body: z.strictObject(NoteFields).partial().extend({
          shared: z.boolean().optional(),
          sharedWith: SharedWith.optional(),
          version: z.number().int().positive().optional(),
        }),
        response: { 200: Note },
      },
    },
    async (req) => {
      const userId = currentUser(req);
      const note = await db.transaction(async (tx) => {
        const v = await noteViewer(tx, req.params.id, userId);
        requireWriter(v);
        const before = await loadNote(tx, v, req.params.noteId, true);
        const { version, shared, sharedWith, ...fields } = req.body;
        if (version !== undefined && version !== before.version) throw versionConflict();
        const nextShared = shared ?? before.shared;
        // Une note privée n'est lisible que par son auteur : seul lui la partage
        if (before.shared && !nextShared && before.ownerUserId !== userId)
          throw new HttpError(
            403,
            'Accès refusé',
            'not_note_owner',
            'Seul l’auteur rend privée une note partagée : créez-en une copie privée',
          );
        let nextSharedWith: string[] | null = null;
        if (!nextShared) {
          if (sharedWith !== undefined) throw shareRequiresShared();
        } else if (sharedWith !== undefined)
          nextSharedWith = await shareTargets(tx, v.access.campaign.id, sharedWith);
        else nextSharedWith = before.shared ? before.sharedWith : null;
        const [after] = await tx
          .update(notes)
          .set({
            ...fields,
            shared: nextShared,
            sharedWith: nextSharedWith,
            version: sql`${notes.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(notes.id, before.id))
          .returning();
        await noteEvent(tx, eventContext(req), v, {
          type: 'note.updated',
          before,
          after: after!,
          changed: changedFields(before, after!),
        });
        return after!;
      });
      return (await notesApi([note], req.headers.authorization))[0]!;
    },
  );

  r.delete(
    '/v1/campaigns/:id/notes/:noteId',
    { ...auth, schema: { params: NoteParams } },
    async (req, reply) => {
      const userId = currentUser(req);
      await db.transaction(async (tx) => {
        const v = await noteViewer(tx, req.params.id, userId);
        requireWriter(v);
        // Privée : seul l'auteur la trouve ; partagée : quiconque la lit (ancienne app)
        const note = await loadNote(tx, v, req.params.noteId, true);
        await tx.delete(notes).where(eq(notes.id, note.id));
        await noteEvent(tx, eventContext(req), v, { type: 'note.deleted', before: note });
      });
      reply.code(204);
    },
  );

  r.post(
    '/v1/campaigns/:id/notes/upload',
    {
      config: UPLOAD_LIMIT,
      // Fonction fléchée : passer app.authenticate tel quel fige le type de `config` sans rateLimit
      preValidation: (req, reply) => app.authenticate(req, reply),
      schema: {
        params: Params,
        body: z.object({
          contentType: z.enum(IMAGE_TYPES),
          size: z.number().int().min(1).max(IMAGE_MAX_BYTES),
        }),
        response: {
          200: z.object({ uploadUrl: z.string(), publicUrl: z.string(), expiresIn: z.number() }),
        },
      },
    },
    async (req) => {
      const v = await noteViewer(db, req.params.id, currentUser(req));
      requireWriter(v);
      if (!deps.signer || !base) throw storageUnavailable();
      const key = imageKey(v.access.campaign.id, req.body.contentType);
      let uploadUrl: string;
      try {
        uploadUrl = await deps.signer({
          key,
          contentType: req.body.contentType,
          size: req.body.size,
          expiresIn: UPLOAD_EXPIRY,
        });
      } catch (err) {
        req.log.error({ err }, 'signature de l’URL d’envoi impossible');
        throw storageUnavailable();
      }
      return { uploadUrl, publicUrl: `${base}/${key}`, expiresIn: UPLOAD_EXPIRY };
    },
  );
};
