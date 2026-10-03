/**
 * Reprise des notes écrites sans l'assainisseur courant : notes importées de
 * l'ancienne app (HTML brut, `sanitizer_version` 0) ou écrites par une version
 * antérieure. Le service les réécrit par lots (HTML assaini, texte brut,
 * aperçu, forme de recherche), sans changer ni leur version ni leur date : ce
 * n'est pas une modification de l'utilisateur, donc pas d'événement.
 *
 * Lancée au démarrage puis à intervalle régulier (un import peut arriver
 * pendant que le service tourne). Plusieurs réplicas se partagent le travail
 * (`FOR UPDATE SKIP LOCKED`). En attendant, une note pas encore reprise est
 * assainie à la volée à chaque lecture (`servedContent`).
 */
import { asc, eq, lt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { notes } from '../../db/schema.js';
import { contentFields, searchTextOf } from './common.js';
import { SANITIZER_VERSION, type SanitizeOptions } from './html.js';

const BATCH = 100;

/** Réassainit toutes les notes en retard ; renvoie leur nombre. */
export async function resanitizeNotes(db: Db, opts: SanitizeOptions): Promise<number> {
  let total = 0;
  for (;;) {
    const done = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: notes.id,
          content: notes.content,
          title: notes.title,
          tags: notes.tags,
          race: notes.race,
          class: notes.class,
          region: notes.region,
          itemType: notes.itemType,
          subQuests: notes.subQuests,
        })
        .from(notes)
        .where(lt(notes.sanitizerVersion, SANITIZER_VERSION))
        .orderBy(asc(notes.id))
        .limit(BATCH)
        .for('update', { skipLocked: true });
      for (const row of rows) {
        const fields = contentFields(row.content, opts, true);
        await tx
          .update(notes)
          .set({ ...fields, searchText: searchTextOf(row, fields.plainText) })
          .where(eq(notes.id, row.id));
      }
      return rows.length;
    });
    total += done;
    if (done < BATCH) return total;
  }
}

/** Intervalle entre deux passes (après la première, au démarrage). */
export const BACKFILL_INTERVAL_MS = 10 * 60_000;
