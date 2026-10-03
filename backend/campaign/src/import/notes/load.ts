/**
 * Écriture des notes migrées d'une campagne, dans une transaction, avec un
 * événement `note.imported` (acteur système, MJ seulement, compteurs seuls) si
 * quelque chose a été écrit. Rejouable : identifiants stables et conflits
 * ignorés (`ON CONFLICT DO NOTHING`) ; une note déjà importée n'est jamais
 * écrasée (elle a pu être modifiée depuis dans l'app).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent } from '../../db/outbox.js';
import { notes } from '../../db/schema.js';
import type { NoteInsert } from './transform.js';

export interface NoteCounts {
  private: number;
  shared: number;
}

export const countNotes = (rows: Pick<NoteInsert, 'shared'>[]): NoteCounts => ({
  private: rows.filter((n) => !n.shared).length,
  shared: rows.filter((n) => n.shared).length,
});

/** Notes déjà en base (import précédent) : pour la simulation. */
export async function existingNotes(db: Db, rows: NoteInsert[]): Promise<number> {
  if (!rows.length) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(notes)
    .where(
      inArray(
        notes.id,
        rows.map((n) => n.id),
      ),
    );
  return row?.n ?? 0;
}

const BATCH = 200;

/** Écrit les notes d'une campagne ; renvoie celles réellement insérées. */
export async function loadNotes(
  db: Db,
  campaignId: string,
  rows: NoteInsert[],
  correlationId: string,
): Promise<NoteCounts> {
  return db.transaction(async (tx) => {
    const inserted: { shared: boolean }[] = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      inserted.push(
        ...(await tx
          .insert(notes)
          .values(rows.slice(i, i + BATCH))
          .onConflictDoNothing()
          .returning({ shared: notes.shared })),
      );
    }
    const counts = countNotes(inserted);
    if (inserted.length)
      await appendEvent(
        tx,
        { correlationId },
        {
          type: 'note.imported',
          campaignId,
          actor: { userId: null, role: 'system', characterId: null },
          aggregate: { type: 'campaign', id: campaignId },
          payload: { counts },
          visibility: 'gm_only',
        },
      );
    return counts;
  });
}

export interface Reattribution {
  /** Notes dont l'auteur, le personnage ou les destinataires changent. */
  changed: number;
  /** Notes modifiées dans l'app depuis l'import : laissées telles quelles. */
  edited: number;
}

const sameIds = (a: readonly string[] | null, b: readonly string[] | null | undefined) =>
  a === null || b === null || b === undefined
    ? a === (b ?? null)
    : a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Réattribution des notes déjà importées (règles de `transformNotes` rejouées sur des
 * correspondances à jour : personnage engagé depuis, compte migré depuis) : auteur, personnage
 * et destinataires seulement, jamais le texte. Une note modifiée dans l'app depuis l'import
 * (version > 1) est laissée. Avec `write`, une transaction et un événement `note.reattributed`
 * (acteur système, MJ seulement, compteur seul) si quelque chose change.
 */
export async function reattributeNotes(
  db: Db,
  campaignId: string,
  rows: NoteInsert[],
  correlationId: string,
  write: boolean,
): Promise<Reattribution> {
  if (!rows.length) return { changed: 0, edited: 0 };
  const wanted = new Map(rows.map((r) => [r.id!, r]));
  const existing = await db
    .select({
      id: notes.id,
      ownerUserId: notes.ownerUserId,
      characterId: notes.characterId,
      shared: notes.shared,
      sharedWith: notes.sharedWith,
      version: notes.version,
    })
    .from(notes)
    .where(inArray(notes.id, [...wanted.keys()]));
  let edited = 0;
  const changes: { id: string; next: NoteInsert }[] = [];
  for (const e of existing) {
    const next = wanted.get(e.id)!;
    const differs =
      e.ownerUserId !== next.ownerUserId ||
      e.characterId !== (next.characterId ?? null) ||
      (e.shared === next.shared && !sameIds(e.sharedWith, next.sharedWith));
    if (!differs) continue;
    if (e.version > 1) {
      edited++;
      continue;
    }
    changes.push({ id: e.id, next });
  }
  if (write && changes.length)
    await db.transaction(async (tx) => {
      for (const { id, next } of changes)
        await tx
          .update(notes)
          .set({
            ownerUserId: next.ownerUserId,
            characterId: next.characterId ?? null,
            ...(next.shared ? { sharedWith: next.sharedWith ?? null } : {}),
            version: sql`${notes.version} + 1`,
          })
          // Pas de course avec l'app : seulement si elle n'a pas été modifiée entre-temps
          .where(and(eq(notes.id, id), eq(notes.version, 1)));
      await appendEvent(
        tx,
        { correlationId },
        {
          type: 'note.reattributed',
          campaignId,
          actor: { userId: null, role: 'system', characterId: null },
          aggregate: { type: 'campaign', id: campaignId },
          payload: { count: changes.length },
          visibility: 'gm_only',
        },
      );
    });
  return { changed: changes.length, edited };
}
