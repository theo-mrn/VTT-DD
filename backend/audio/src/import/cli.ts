/**
 * Import des sons de l'ancienne app dans le service audio (docs/audio.md § 5),
 * APRÈS les campagnes (campaign : salle → campagne).
 *
 *   node --env-file=backend/audio/.env backend/audio/dist/import/cli.js \
 *     --export ~/vtt-export --rtdb ~/vtt-export/rtdb-rooms.json \
 *     --report ~/vtt-export/rapport-audio.ndjson [--importer]
 *
 *   --export    dossier des exports NDJSON : sound_templates (récursif), cartes (musicZones)
 *   --rtdb      export de la Realtime Database (rooms/{salle}/music)
 *   --report    rapport (0600) : une ligne par son, playlist, canal, zone
 *   --importer  écrit en base ; sans lui, simulation (compteurs et rapport seulement)
 *
 * Environnement :
 *   DATABASE_URL           rôle audio_svc (écriture)
 *   CAMPAIGN_DATABASE_URL  rôle campaign_svc (lecture de campaign.legacy_ids : salle → campagne)
 *   S3_*                   bucket de destination des envois copiés
 * Ne pas relancer après la bascule : une playlist supprimée depuis reviendrait.
 */
import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { loadConfig } from '@vtt/platform';
import pg from 'pg';
import { publishedCatalogBase } from '../app.js';
import { createCatalog } from '../catalog/index.js';
import { AudioConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { createS3Storage } from '../storage/s3.js';
import { loadPlan } from './loading.js';
import {
  addMusicState,
  addPlaylist,
  addTemplate,
  addZone,
  createPlan,
  roomOf,
  type FirestoreDoc,
  type RtdbMusic,
} from './transform.js';

const { values } = parseArgs({
  options: {
    export: { type: 'string' },
    rtdb: { type: 'string' },
    report: { type: 'string' },
    importer: { type: 'boolean', default: false },
  },
});
if (!values.export || !values.report) {
  console.error(
    'usage : cli.js --export <dossier> [--rtdb <fichier>] --report <fichier> [--importer]',
  );
  process.exit(2);
}
const campaignUrl = process.env.CAMPAIGN_DATABASE_URL;
if (!campaignUrl) {
  console.error('Manquant : CAMPAIGN_DATABASE_URL (campaign_svc)');
  process.exit(2);
}
const config = loadConfig(AudioConfig, { JWT_ISSUER: '-', JWT_AUDIENCE: '-', ...process.env });

async function* read(name: string): AsyncGenerator<FirestoreDoc> {
  const file = join(values.export!, `${name}.ndjson`);
  if (!existsSync(file)) {
    console.warn(`  (absent : ${name}.ndjson)`);
    return;
  }
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity }))
    if (line.trim()) yield JSON.parse(line) as FirestoreDoc;
}

// Salle de l'ancienne app → campagne importée
const campaignDb = new pg.Client({
  connectionString: campaignUrl,
  application_name: 'audio-import',
});
await campaignDb.connect();
const rooms = new Map<string, string>(
  (
    await campaignDb.query<{ legacy_id: string; campaign_id: string }>(
      "select legacy_id, campaign_id from campaign.legacy_ids where source = 'firebase' and legacy_id like 'Salle/%'",
    )
  ).rows.map((r) => [r.legacy_id.slice('Salle/'.length), r.campaign_id]),
);
await campaignDb.end();

const catalog = createCatalog({ publishedBase: publishedCatalogBase(config) });
const plan = createPlan();
const report = createWriteStream(values.report, { mode: 0o600 });
const campaignOf = (path: string) => {
  const c = rooms.get(roomOf(path));
  if (!c)
    plan.report.push({
      type: 'room',
      legacy: path,
      status: 'ignored',
      detail: 'campagne non importée',
    });
  return c;
};

const templates: FirestoreDoc[] = [];
const lists: FirestoreDoc[] = [];
for await (const doc of read('sound_templates')) {
  if (/^sound_templates\/[^/]+\/templates\/[^/]+$/.test(doc.path)) templates.push(doc);
  else if (/^sound_templates\/[^/]+\/playlists\/[^/]+$/.test(doc.path)) lists.push(doc);
}
const byTemplate = new Map<string, string>();
for (const doc of templates) {
  const c = campaignOf(doc.path);
  if (!c) continue;
  const id = addTemplate(plan, doc, c, catalog);
  if (id) byTemplate.set(doc.path, id);
}
for (const doc of lists) {
  const c = campaignOf(doc.path);
  if (c) addPlaylist(plan, doc, c, (p) => byTemplate.get(p));
}
for await (const doc of read('cartes')) {
  if (!/^cartes\/[^/]+\/musicZones\/[^/]+$/.test(doc.path)) continue;
  const c = campaignOf(doc.path);
  if (c) addZone(plan, doc, c, catalog);
}
if (values.rtdb && existsSync(values.rtdb)) {
  const rtdb = JSON.parse(readFileSync(values.rtdb, 'utf8')) as {
    rooms?: Record<string, { music?: RtdbMusic } | null>;
  };
  for (const [room, node] of Object.entries(rtdb.rooms ?? {})) {
    if (!node?.music) continue;
    const c = campaignOf(`rooms/${room}`);
    if (c) addMusicState(plan, room, node.music, c, (p) => byTemplate.get(p));
  }
}

const bySource = { youtube: 0, catalog: 0, upload: 0 };
for (const a of plan.assets.values()) bySource[a.source] += 1;
console.log(
  `Plan : ${plan.assets.size} son(s) (YouTube ${bySource.youtube}, catalogue ${bySource.catalog}, envois ${bySource.upload}), ` +
    `${plan.playlists.length} playlist(s), ${plan.channels.length} canal(aux)`,
);

if (values.importer) {
  const { db, pool } = createDb(config.DATABASE_URL, 'audio-import');
  const counters = await loadPlan(db, plan, {
    storage: createS3Storage(config),
    report: (l) => plan.report.push(l),
  });
  await pool.end();
  console.log(
    `Import : ${counters.assets} son(s) créés (${counters.copied} copiés), ${counters.playlists} playlist(s), ` +
      `${counters.channels} canal(aux), ${counters.skipped} déjà présents, ${counters.errors} erreur(s)`,
  );
} else console.log('Simulation : rien n’est écrit (relancer avec --importer)');

for (const line of plan.report) report.write(`${JSON.stringify(line)}\n`);
report.end();
const problems = plan.report.filter((r) => r.status === 'error' || r.status === 'ignored').length;
console.log(`Rapport : ${values.report} (${plan.report.length} ligne(s), ${problems} à vérifier)`);
