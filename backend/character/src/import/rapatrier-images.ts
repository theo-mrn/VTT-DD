/**
 * Rapatrie dans le stockage S3 les avatars de personnages encore hébergés sur
 * Firebase Storage (import déjà fait). Rejouable : seules les adresses
 * Firebase restantes sont traitées. Usage :
 *   node --env-file=backend/character/.env dist/import/rapatrier-images.js
 * (variables S3_* dans l'environnement, voir infra/local/import-personnages.sh)
 */
import { and, eq, like } from 'drizzle-orm';
import { createDb } from '../db/client.js';
import { characters } from '../db/schema.js';
import { envoyeurImages, ImageDisparue, telechargerImage } from './images.js';

const envoyer = envoyeurImages();
if (!envoyer) {
  console.error('Stockage S3 non configuré (variables S3_*) : rien à faire.');
  process.exit(1);
}
const { db, pool } = createDb(process.env.DATABASE_URL!);
const lignes = await db
  .select({ id: characters.id, nom: characters.nom, avatarUrl: characters.avatarUrl })
  .from(characters)
  .where(like(characters.avatarUrl, 'https://firebasestorage.googleapis.com/%'));

let ok = 0;
let echecs = 0;
let disparues = 0;
for (const l of lignes) {
  try {
    const url = await envoyer(await telechargerImage(l.avatarUrl!));
    await db
      .update(characters)
      .set({ avatarUrl: url })
      .where(and(eq(characters.id, l.id), eq(characters.avatarUrl, l.avatarUrl!)));
    ok++;
  } catch (err) {
    if (err instanceof ImageDisparue) {
      // Lien mort : on ne garde pas une adresse qui ne mène nulle part
      await db
        .update(characters)
        .set({ avatarUrl: null })
        .where(and(eq(characters.id, l.id), eq(characters.avatarUrl, l.avatarUrl!)));
      disparues++;
      continue;
    }
    echecs++;
    console.warn(`  ${l.nom} : ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(
  `Avatars rapatriés : ${ok}, disparus (adresse vidée) : ${disparues}, échecs : ${echecs}, sur ${lignes.length}.`,
);
await pool.end();
