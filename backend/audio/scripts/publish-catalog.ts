/**
 * Publie une fois le catalogue Star Wars dans le bucket (docs/audio.md § 3.4) :
 * les 20 wav de l'ancienne app (legacy/public/effects/Star Wars/, 26 Mo) sont
 * transcodés en AAC (m4a) et déposés sous audio/catalog/starwars/…, là où le
 * catalogue du service les annonce. Rejouable : un fichier déjà publié est gardé.
 *
 *   pnpm --filter @vtt/audio publish:catalog            # simulation
 *   pnpm --filter @vtt/audio publish:catalog --publier  # dépôt réel (S3_* du .env)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '@vtt/platform';
import { starwarsKey } from '../src/catalog/index.js';
import { STARWARS_SOUNDS } from '../src/catalog/data.js';
import { AudioConfig } from '../src/config.js';
import { createS3Storage } from '../src/storage/s3.js';

const publish = process.argv.includes('--publier');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const config = loadConfig(AudioConfig, { JWT_ISSUER: '-', JWT_AUDIENCE: '-', ...process.env });
const storage = createS3Storage(config);
if (publish && !storage) throw new Error('S3_* absent : rien à publier');
const dir = mkdtempSync(join(tmpdir(), 'catalog-'));
let done = 0;
try {
  for (const [name, path] of STARWARS_SOUNDS) {
    const source = join(root, 'legacy/public', decodeURIComponent(path));
    const key = starwarsKey(path);
    if (!existsSync(source)) {
      console.warn(`absent : ${source}`);
      continue;
    }
    if (!publish) {
      console.log(`${name} → ${key}`);
      continue;
    }
    if (await storage!.head(key)) {
      console.log(`déjà publié : ${key}`);
      continue;
    }
    const out = join(dir, 'out.m4a');
    execFileSync(config.FFMPEG_PATH, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      source,
      '-vn',
      '-map_metadata',
      '-1',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      out,
    ]);
    await storage!.upload(key, out, 'audio/mp4');
    done += 1;
    console.log(`publié : ${key}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(publish ? `${done} fichier(s) publié(s)` : 'simulation : relancer avec --publier');
