/**
 * Enregistre les descriptions écrites par des agents (docs/bibliotheque.md § Import) :
 *
 *   pnpm --filter @vtt/library run apply-descriptions <réponses.json>…
 *
 * Chaque fichier : `{ "source": "dndbackdrop", "answers": [{ "key", …réponse, "view" }] }`, la
 * même réponse que celle demandée à l'API (`Answer`), plus la vue : `top_down` (plan de carte)
 * ou `scene` (illustration). Chaque réponse est validée et nettoyée comme une réponse de l'API ;
 * une réponse invalide est signalée et ignorée, les autres sont enregistrées.
 */
import { readFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDb } from '../db/client.js';
import { backgrounds } from '../db/schema.js';
import { Answer, cleanAnswer, DESCRIBE_TEMPLATE } from './describe.js';
import { SOURCES } from './sources.js';
import { saveDescription } from './store.js';

const args = process.argv.slice(2);
/** --keep-kind : l'usage vient de la source (packs de plans), la vue de l'agent n'est pas lue. */
const keepKind = args.includes('--keep-kind');
const files = args.filter((a) => a !== '--keep-kind');

const View = z.enum(['top_down', 'scene']);
const AgentAnswer = Answer.extend({
  key: z.string().min(1),
  view: keepKind ? View.optional() : View,
});
const AgentFile = z.object({
  source: z.enum(SOURCES),
  answers: z.array(z.unknown()),
});
if (!files.length) {
  console.error('usage : apply-descriptions <réponses.json>…');
  process.exit(2);
}
const url = z.string().min(1).parse(process.env.DATABASE_URL);
const { db, pool } = createDb(url);
let saved = 0;
let invalid = 0;
let unknown = 0;
for (const file of files) {
  const { source, answers } = AgentFile.parse(JSON.parse(await readFile(file, 'utf8')));
  for (const raw of answers) {
    const parsed = AgentAnswer.safeParse(raw);
    if (!parsed.success) {
      invalid++;
      console.error(
        `  ✗ ${file} : ${(raw as { key?: string })?.key ?? '?'} : ${parsed.error.issues[0]?.message}`,
      );
      continue;
    }
    const a = parsed.data;
    const [row] = await db
      .select({ id: backgrounds.id, collection: backgrounds.collection })
      .from(backgrounds)
      .where(and(eq(backgrounds.source, source), eq(backgrounds.sourceKey, a.key)))
      .limit(1);
    if (!row) {
      unknown++;
      console.error(`  ✗ ${file} : lieu inconnu ${a.key}`);
      continue;
    }
    await saveDescription(db, row.id, row.collection, cleanAnswer(a), `agent#${DESCRIBE_TEMPLATE}`);
    if (!keepKind)
      await db
        .update(backgrounds)
        .set({ kind: a.view === 'top_down' ? 'map' : 'illustration' })
        .where(eq(backgrounds.id, row.id));
    saved++;
  }
}
console.log(`${saved} descriptions enregistrées, ${invalid} invalides, ${unknown} lieux inconnus`);
await pool.end();
