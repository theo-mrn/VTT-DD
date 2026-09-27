/**
 * Écriture des notes migrées d'une campagne, dans une transaction, avec un
 * événement `note.imported` (acteur système, MJ seulement, compteurs seuls) si
 * quelque chose a été écrit. Rejouable : identifiants stables et conflits
 * ignorés (`ON CONFLICT DO NOTHING`) ; une note déjà importée n'est jamais
 * écrasée (elle a pu être modifiée depuis dans l'app).
 */
import { inArray, sql } from 'drizzle-orm';
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
