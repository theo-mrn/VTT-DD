/**
 * Modèles du MJ en base : catégories et modèles de PNJ, modèles d'objets.
 * Chaque écriture est une transaction qui porte son événement dans l'outbox
 * (`npc_template.*`, `object_template.*`), dans le sujet de la campagne et
 * visible du MJ seul (`gm_only`). Les mises à jour portent le diff avant/après
 * (`changes`, voir docs/bus.md) et la concurrence optimiste (`version`).
 *
 * L'accès (MJ de la campagne) est vérifié avant, par les routes ; ici, une
 * ligne d'une autre campagne est simplement introuvable.
 */
import { changesPayload, TRASH_DAYS, uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { EtatEntite, ficheJson, type SystemeCharge, type Valeur } from '@vtt/rules';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import {
  npcTemplateCategories,
  npcTemplates,
  objectTemplates,
  type NpcTemplateAction,
} from '../../db/schema.js';
import type { Catalogue } from '../../regles/catalogue.js';
import { etatInitial, modifierValeurs, refus, verifierEtat } from '../../regles/operations.js';
import { etatNormalise, IDENTITES } from '../personnages/depot.js';

export type CategoryRow = typeof npcTemplateCategories.$inferSelect;
export type NpcTemplateRow = typeof npcTemplates.$inferSelect;
export type ObjectTemplateRow = typeof objectTemplates.$inferSelect;

/** Auteur d'une écriture : le MJ de la campagne. */
export interface Author {
  campaignId: string;
  userId: string;
}

async function emit(
  tx: Tx,
  ctx: EventContext,
  author: Author,
  type: string,
  aggregate: { type: string; id: string },
  payload: Record<string, unknown>,
) {
  await appendEvent(tx, ctx, {
    type,
    roomId: author.campaignId,
    actor: { userId: author.userId, role: 'gm', characterId: null },
    aggregate,
    payload,
    visibility: 'gm_only',
  });
}

function checkVersion(row: { version: number }, version: number, what: string) {
  if (row.version !== version)
    throw HttpError.conflict(
      `${what} a été modifié entre-temps (version ${row.version}, reçue ${version}) : ` +
        'relisez-le puis réessayez',
      'version_perimee',
    );
}

/** Seulement les champs fournis (`undefined` : inchangé ; `null` : effacé). */
function provided<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const iso = (d: Date) => d.toISOString();

// ─── État d'un modèle de PNJ ─────────────────────────────────────────────────

export function systemOf(catalogue: Catalogue, id: string): SystemeCharge {
  const s = catalogue.charge(id);
  if (!s) throw HttpError.badRequest(`Système inconnu : ${id}`, 'systeme_inconnu');
  return s;
}

/**
 * Pose des valeurs saisissables sur un état de modèle, avec les droits du MJ (valeurs de base,
 * choix, textes). Un état illisible est rendu tel quel : `templateState` le refusera.
 */
function withValues(catalogue: Catalogue, raw: unknown, valeurs: Record<string, Valeur>): unknown {
  const r = EtatEntite.safeParse(raw);
  if (!r.success) return raw;
  return modifierValeurs(systemOf(catalogue, r.data.systeme.id), r.data, valeurs, {
    proprietaire: true,
    mj: true,
  });
}

/**
 * État d'un modèle de PNJ, validé et recalculé comme celui d'un personnage
 * (`verifierEtat`). Un modèle n'est jamais en cours de création : `creation`
 * est toujours enregistré à faux. `systemId` : système imposé (mise à jour).
 */
export function templateState(
  catalogue: Catalogue,
  input: {
    etat?: unknown;
    systemeId?: string;
    type?: string;
    /** Valeurs saisissables à poser sur l'état (création rapide, modification d'un modèle). */
    valeurs?: Record<string, Valeur>;
  },
  systemId?: string,
): EtatEntite {
  const base =
    input.etat !== undefined
      ? input.etat
      : etatInitial(systemOf(catalogue, input.systemeId!), input.type!);
  const raw =
    input.valeurs && Object.keys(input.valeurs).length
      ? withValues(catalogue, base, input.valeurs)
      : base;
  const r = EtatEntite.safeParse(raw);
  if (!r.success) {
    const detail = r.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' ; ');
    throw refus(`État invalide : ${detail}`, 'etat_invalide');
  }
  if (systemId && r.data.systeme.id !== systemId)
    throw refus(`État d’un autre système : ${r.data.systeme.id}`, 'etat_invalide');
  return verifierEtat(systemOf(catalogue, r.data.systeme.id), { ...r.data, creation: false }).etat;
}

// ─── Formes de l'API ─────────────────────────────────────────────────────────

export const categoryApi = (r: CategoryRow) => ({
  id: r.id,
  campaignId: r.campaignId,
  name: r.name,
  color: r.color,
  version: r.version,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

/** Modèle de PNJ avec sa fiche recalculée. */
export function npcTemplateApi(catalogue: Catalogue, r: NpcTemplateRow) {
  const systeme = catalogue.charge(r.systemId);
  if (!systeme) throw new Error(`Système ${r.systemId} absent du catalogue`);
  const { etat, fiche } = verifierEtat(systeme, r.etat);
  return {
    id: r.id,
    campaignId: r.campaignId,
    categoryId: r.categoryId,
    name: r.name,
    imageUrl: r.imageUrl,
    tokenUrl: r.tokenUrl,
    actions: r.actions,
    etat,
    fiche: ficheJson(fiche),
    version: r.version,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export const objectTemplateApi = (r: ObjectTemplateRow) => ({
  id: r.id,
  campaignId: r.campaignId,
  name: r.name,
  imageUrl: r.imageUrl,
  category: r.category,
  version: r.version,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

// ─── Catégories de PNJ ───────────────────────────────────────────────────────

const trackCategory = (r: CategoryRow) => ({ name: r.name, color: r.color });

export function listCategories(db: Db, campaignId: string) {
  return db
    .select()
    .from(npcTemplateCategories)
    .where(eq(npcTemplateCategories.campaignId, campaignId))
    .orderBy(asc(npcTemplateCategories.createdAt), asc(npcTemplateCategories.id));
}

async function lockCategory(tx: Tx, campaignId: string, id: string, mode: 'update' | 'share') {
  const [row] = await tx
    .select()
    .from(npcTemplateCategories)
    .where(and(eq(npcTemplateCategories.id, id), eq(npcTemplateCategories.campaignId, campaignId)))
    .for(mode);
  return row;
}

export function createCategory(
  db: Db,
  ctx: EventContext,
  author: Author,
  data: { name: string; color?: string | null },
): Promise<CategoryRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(npcTemplateCategories)
      .values({
        id: uuidv7(),
        campaignId: author.campaignId,
        name: data.name,
        color: data.color ?? null,
        createdBy: author.userId,
      })
      .returning();
    await emit(
      tx,
      ctx,
      author,
      'npc_template.category_created',
      { type: 'npc_template_category', id: row!.id },
      { version: 1, ...trackCategory(row!) },
    );
    return row!;
  });
}

export function updateCategory(
  db: Db,
  ctx: EventContext,
  author: Author,
  id: string,
  version: number,
  patch: { name?: string; color?: string | null },
): Promise<CategoryRow> {
  return db.transaction(async (tx) => {
    const before = await lockCategory(tx, author.campaignId, id, 'update');
    if (!before) throw HttpError.notFound('Catégorie introuvable');
    checkVersion(before, version, 'La catégorie');
    const [after] = await tx
      .update(npcTemplateCategories)
      .set({ ...provided(patch), version: before.version + 1, updatedAt: sql`now()` })
      .where(eq(npcTemplateCategories.id, id))
      .returning();
    await emit(
      tx,
      ctx,
      author,
      'npc_template.category_updated',
      { type: 'npc_template_category', id },
      { version: after!.version, ...changesPayload(trackCategory(before), trackCategory(after!)) },
    );
    return after!;
  });
}

/** Supprime une catégorie : ses modèles restent, rangés « sans catégorie ». */
export async function deleteCategory(db: Db, ctx: EventContext, author: Author, id: string) {
  await db.transaction(async (tx) => {
    const row = await lockCategory(tx, author.campaignId, id, 'update');
    if (!row) throw HttpError.notFound('Catégorie introuvable');
    const detached = await tx
      .update(npcTemplates)
      .set({ categoryId: null, version: sql`${npcTemplates.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(npcTemplates.campaignId, author.campaignId), eq(npcTemplates.categoryId, id)))
      .returning({ id: npcTemplates.id });
    await tx.delete(npcTemplateCategories).where(eq(npcTemplateCategories.id, id));
    await emit(
      tx,
      ctx,
      author,
      'npc_template.category_deleted',
      { type: 'npc_template_category', id },
      { name: row.name, detachedTemplateIds: detached.map((d) => d.id) },
    );
  });
}

// ─── Modèles de PNJ ──────────────────────────────────────────────────────────

const trackTemplate = (r: NpcTemplateRow) => ({
  name: r.name,
  categoryId: r.categoryId,
  imageUrl: r.imageUrl,
  tokenUrl: r.tokenUrl,
  actions: r.actions,
  etat: etatNormalise(r.etat),
});

export function listNpcTemplates(db: Db, campaignId: string) {
  return db
    .select()
    .from(npcTemplates)
    .where(and(eq(npcTemplates.campaignId, campaignId), isNull(npcTemplates.deletedAt)))
    .orderBy(asc(npcTemplates.createdAt), asc(npcTemplates.id));
}

/** Catégorie désignée par un corps de requête : de la même campagne, verrouillée jusqu'à la fin. */
async function checkCategory(tx: Tx, campaignId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  if (!(await lockCategory(tx, campaignId, categoryId, 'share')))
    throw new HttpError(
      422,
      'Refusé',
      'category_not_found',
      'Catégorie introuvable dans cette campagne',
    );
}

export interface NpcTemplateInput {
  name: string;
  categoryId?: string | null;
  imageUrl?: string | null;
  tokenUrl?: string | null;
  actions?: NpcTemplateAction[];
  etat: EtatEntite;
}

export function createNpcTemplate(
  db: Db,
  ctx: EventContext,
  author: Author,
  data: NpcTemplateInput,
): Promise<NpcTemplateRow> {
  return db.transaction(async (tx) => {
    await checkCategory(tx, author.campaignId, data.categoryId);
    const [row] = await tx
      .insert(npcTemplates)
      .values({
        id: uuidv7(),
        campaignId: author.campaignId,
        categoryId: data.categoryId ?? null,
        name: data.name,
        imageUrl: data.imageUrl ?? null,
        tokenUrl: data.tokenUrl ?? null,
        systemId: data.etat.systeme.id,
        systemVersion: data.etat.systeme.version,
        type: data.etat.type,
        etat: data.etat,
        actions: data.actions ?? [],
        createdBy: author.userId,
      })
      .returning();
    await emit(
      tx,
      ctx,
      author,
      'npc_template.created',
      { type: 'npc_template', id: row!.id },
      {
        version: 1,
        name: row!.name,
        categoryId: row!.categoryId,
        systeme: data.etat.systeme,
        type: data.etat.type,
      },
    );
    return row!;
  });
}

/** Modèle verrouillé ; `trashed` : celui de la corbeille (restauration), sinon un modèle actif. */
async function lockNpcTemplate(tx: Tx, campaignId: string, id: string, trashed = false) {
  const [row] = await tx
    .select()
    .from(npcTemplates)
    .where(
      and(
        eq(npcTemplates.id, id),
        eq(npcTemplates.campaignId, campaignId),
        trashed ? inTrash(npcTemplates.deletedAt) : isNull(npcTemplates.deletedAt),
      ),
    )
    .for('update');
  if (!row) throw HttpError.notFound('Modèle de PNJ introuvable');
  return row;
}

/**
 * Met à jour un modèle de PNJ. `etat` est calculé à partir de la ligne
 * verrouillée (même système imposé) par `state`, appelé seulement si le corps
 * en apporte un.
 */
export function updateNpcTemplate(
  db: Db,
  ctx: EventContext,
  author: Author,
  id: string,
  version: number,
  patch: Partial<Omit<NpcTemplateInput, 'etat'>>,
  state?: (row: NpcTemplateRow) => EtatEntite,
): Promise<NpcTemplateRow> {
  return db.transaction(async (tx) => {
    const before = await lockNpcTemplate(tx, author.campaignId, id);
    checkVersion(before, version, 'Le modèle');
    await checkCategory(tx, author.campaignId, patch.categoryId);
    const etat = state?.(before);
    const [after] = await tx
      .update(npcTemplates)
      .set({
        ...provided(patch),
        ...(etat ? { etat, systemVersion: etat.systeme.version, type: etat.type } : {}),
        version: before.version + 1,
        updatedAt: sql`now()`,
      })
      .where(eq(npcTemplates.id, id))
      .returning();
    await emit(
      tx,
      ctx,
      author,
      'npc_template.updated',
      { type: 'npc_template', id },
      {
        version: after!.version,
        ...changesPayload(trackTemplate(before), trackTemplate(after!), IDENTITES),
      },
    );
    return after!;
  });
}

export async function deleteNpcTemplate(db: Db, ctx: EventContext, author: Author, id: string) {
  await db.transaction(async (tx) => {
    const row = await lockNpcTemplate(tx, author.campaignId, id);
    // Corbeille : marqué, restaurable `TRASH_DAYS` jours, puis purgé (docs/nettoyage.md)
    await tx
      .update(npcTemplates)
      .set({ deletedAt: sql`now()`, version: row.version + 1, updatedAt: sql`now()` })
      .where(eq(npcTemplates.id, id));
    await emit(
      tx,
      ctx,
      author,
      'npc_template.deleted',
      { type: 'npc_template', id },
      { name: row.name },
    );
  });
}

// ─── Modèles d'objets ────────────────────────────────────────────────────────

const trackObject = (r: ObjectTemplateRow) => ({
  name: r.name,
  imageUrl: r.imageUrl,
  category: r.category,
});

export function listObjectTemplates(db: Db, campaignId: string) {
  return db
    .select()
    .from(objectTemplates)
    .where(and(eq(objectTemplates.campaignId, campaignId), isNull(objectTemplates.deletedAt)))
    .orderBy(asc(objectTemplates.createdAt), asc(objectTemplates.id));
}

export function createObjectTemplate(
  db: Db,
  ctx: EventContext,
  author: Author,
  data: { name: string; imageUrl?: string | null; category?: string | null },
): Promise<ObjectTemplateRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(objectTemplates)
      .values({
        id: uuidv7(),
        campaignId: author.campaignId,
        name: data.name,
        imageUrl: data.imageUrl ?? null,
        category: data.category ?? null,
        createdBy: author.userId,
      })
      .returning();
    await emit(
      tx,
      ctx,
      author,
      'object_template.created',
      { type: 'object_template', id: row!.id },
      { version: 1, ...trackObject(row!) },
    );
    return row!;
  });
}

async function lockObjectTemplate(tx: Tx, campaignId: string, id: string, trashed = false) {
  const [row] = await tx
    .select()
    .from(objectTemplates)
    .where(
      and(
        eq(objectTemplates.id, id),
        eq(objectTemplates.campaignId, campaignId),
        trashed ? inTrash(objectTemplates.deletedAt) : isNull(objectTemplates.deletedAt),
      ),
    )
    .for('update');
  if (!row) throw HttpError.notFound("Modèle d'objet introuvable");
  return row;
}

export function updateObjectTemplate(
  db: Db,
  ctx: EventContext,
  author: Author,
  id: string,
  version: number,
  patch: { name?: string; imageUrl?: string | null; category?: string | null },
): Promise<ObjectTemplateRow> {
  return db.transaction(async (tx) => {
    const before = await lockObjectTemplate(tx, author.campaignId, id);
    checkVersion(before, version, 'Le modèle');
    const [after] = await tx
      .update(objectTemplates)
      .set({ ...provided(patch), version: before.version + 1, updatedAt: sql`now()` })
      .where(eq(objectTemplates.id, id))
      .returning();
    await emit(
      tx,
      ctx,
      author,
      'object_template.updated',
      { type: 'object_template', id },
      { version: after!.version, ...changesPayload(trackObject(before), trackObject(after!)) },
    );
    return after!;
  });
}

export async function deleteObjectTemplate(db: Db, ctx: EventContext, author: Author, id: string) {
  await db.transaction(async (tx) => {
    const row = await lockObjectTemplate(tx, author.campaignId, id);
    await tx
      .update(objectTemplates)
      .set({ deletedAt: sql`now()`, version: row.version + 1, updatedAt: sql`now()` })
      .where(eq(objectTemplates.id, id));
    await emit(
      tx,
      ctx,
      author,
      'object_template.deleted',
      { type: 'object_template', id },
      { name: row.name },
    );
  });
}

// ─── Corbeille (docs/nettoyage.md) ──────────────────────────────────────────

/** Marqué depuis moins de `TRASH_DAYS` jours : restaurable (au-delà, en attente de purge). */
function inTrash(column: typeof npcTemplates.deletedAt | typeof objectTemplates.deletedAt) {
  return and(isNotNull(column), sql`${column} > now() - make_interval(days => ${TRASH_DAYS})`)!;
}

/** Modèles de PNJ et d'objets de la corbeille d'une campagne, les plus récents d'abord. */
export async function trashedTemplates(db: Db, campaignId: string) {
  const [npcs, objects] = await Promise.all([
    db
      .select()
      .from(npcTemplates)
      .where(and(eq(npcTemplates.campaignId, campaignId), inTrash(npcTemplates.deletedAt)))
      .orderBy(desc(npcTemplates.deletedAt)),
    db
      .select()
      .from(objectTemplates)
      .where(and(eq(objectTemplates.campaignId, campaignId), inTrash(objectTemplates.deletedAt)))
      .orderBy(desc(objectTemplates.deletedAt)),
  ]);
  return { npcs, objects };
}

export async function restoreNpcTemplate(db: Db, ctx: EventContext, author: Author, id: string) {
  return db.transaction(async (tx) => {
    const row = await lockNpcTemplate(tx, author.campaignId, id, true);
    const [after] = await tx
      .update(npcTemplates)
      .set({ deletedAt: null, version: row.version + 1, updatedAt: sql`now()` })
      .where(eq(npcTemplates.id, id))
      .returning();
    await emit(
      tx,
      ctx,
      author,
      'npc_template.restored',
      { type: 'npc_template', id },
      { version: after!.version, name: row.name },
    );
    return after!;
  });
}

export async function restoreObjectTemplate(db: Db, ctx: EventContext, author: Author, id: string) {
  return db.transaction(async (tx) => {
    const row = await lockObjectTemplate(tx, author.campaignId, id, true);
    const [after] = await tx
      .update(objectTemplates)
      .set({ deletedAt: null, version: row.version + 1, updatedAt: sql`now()` })
      .where(eq(objectTemplates.id, id))
      .returning();
    await emit(
      tx,
      ctx,
      author,
      'object_template.restored',
      { type: 'object_template', id },
      { version: after!.version, name: row.name },
    );
    return after!;
  });
}
