/**
 * Import des cartes Firebase dans le service campaign, APRÈS les comptes, les
 * personnages et les campagnes. Sous-commande du CLI d'import de campaign :
 *
 *   node --env-file=backend/campaign/.env backend/campaign/dist/import/cli.js maps \
 *     --export ~/vtt-export --rtdb ~/vtt-export/rtdb-rooms.json \
 *     --report ~/vtt-export/rapport-cartes.ndjson [--importer]
 *
 *   --export    dossier des exports NDJSON de tools/firebase-export (cartes, récursif)
 *   --rtdb      JSON de la Realtime Database : export complet de la console
 *               Firebase ou `{ "rooms": { … } }` (positions, murs, dessins, textes,
 *               gabarits, musique) ; facultatif mais sans lui ces données manquent
 *   --report    rapport par campagne (compteurs, avertissements)
 *   --importer  écrit en base ; sans lui, simulation (rien n'est écrit)
 *
 * Environnement :
 *   DATABASE_URL            rôle campaign_svc (campagnes importées, engagements ; écriture)
 *   CHARACTER_DATABASE_URL  rôle characters_svc : personnages importés (lecture)
 *   IDENTITY_DATABASE_URL   rôle identity_svc : auteurs des gabarits (lecture, facultatif)
 *   S3_*                    stockage : médias Firebase Storage et `data:` rapatriés
 * La sortie ne contient que des compteurs ; le détail est dans le rapport (0600).
 */
import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { uuidv7 } from '@vtt/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import pg from 'pg';
import { createDb } from '../../db/client.js';
import { campaignCharacters, campaigns, legacyIds } from '../../db/schema.js';
import { isDataUrl, isFirebaseStorage, MAP_MEDIA_TYPES, mediaRehoster } from '../images.js';
import type { FirestoreDoc } from '../legacy.js';
import { LEGACY_SOURCE } from '../loading.js';
import {
  emptyCounts,
  existing,
  loadMaps,
  produced,
  TABLES,
  type Counts,
  type TableName,
} from './load.js';
import { transformRoom, type MigratedMaps, type RtdbRoom } from './transform.js';

const { values } = parseArgs({
  args: process.argv.slice(3),
  options: {
    export: { type: 'string' },
    rtdb: { type: 'string' },
    report: { type: 'string' },
    importer: { type: 'boolean', default: false },
  },
});
if (!values.export || !values.report) {
  console.error(
    'usage : cli.js maps --export <dossier> [--rtdb <fichier.json>] --report <fichier> [--importer]',
  );
  process.exit(2);
}
const write = values.importer;
const env = {
  campaign: process.env.DATABASE_URL || undefined,
  character: process.env.CHARACTER_DATABASE_URL || undefined,
  identity: process.env.IDENTITY_DATABASE_URL || undefined,
};
const missing = [
  !env.campaign && 'DATABASE_URL (campaign_svc)',
  !env.character && 'CHARACTER_DATABASE_URL (characters_svc)',
].filter(Boolean);
if (missing.length) {
  console.error(`Manquant : ${missing.join(', ')}`);
  process.exit(2);
}

// ─── Lecture des exports ─────────────────────────────────────────────────────

const file = join(values.export, 'cartes.ndjson');
if (!existsSync(file)) {
  console.error(`${file} introuvable : exporter d'abord la collection cartes (récursive)`);
  process.exit(1);
}
const byRoom = new Map<string, FirestoreDoc[]>();
let line = 0;
for await (const text of createInterface({ input: createReadStream(file, 'utf8') })) {
  line++;
  if (!text.trim()) continue;
  let doc: FirestoreDoc;
  try {
    const { path, id, data } = JSON.parse(text) as FirestoreDoc;
    doc = { path: path ?? id, id, data: data ?? {} };
  } catch {
    throw new Error(`${file}:${line} : JSON invalide`);
  }
  const code = doc.path.split('/')[1];
  if (!code) continue;
  const list = byRoom.get(code) ?? [];
  list.push(doc);
  byRoom.set(code, list);
}

let rtdbRooms: Record<string, RtdbRoom> = {};
if (values.rtdb) {
  const raw = JSON.parse(readFileSync(values.rtdb, 'utf8')) as { rooms?: Record<string, RtdbRoom> };
  rtdbRooms = raw.rooms ?? {};
} else
  console.warn('  (sans --rtdb : ni murs, ni dessins, ni textes récents, positions Firestore)');
for (const code of Object.keys(rtdbRooms)) if (!byRoom.has(code)) byRoom.set(code, []);
console.log(`${byRoom.size} salle(s) avec des données de carte`);

// ─── Correspondances (lecture seule) ─────────────────────────────────────────

const base = createDb(env.campaign!);
const characterDb = new pg.Pool({ connectionString: env.character, max: 2 });
const identityDb = env.identity ? new pg.Pool({ connectionString: env.identity, max: 2 }) : null;

const imported = await base.db
  .select({ legacyId: legacyIds.legacyId, id: campaigns.id, ownerId: campaigns.ownerId })
  .from(legacyIds)
  .innerJoin(campaigns, eq(campaigns.id, legacyIds.campaignId))
  .where(
    and(
      eq(legacyIds.source, LEGACY_SOURCE),
      inArray(
        legacyIds.legacyId,
        [...byRoom.keys()].map((c) => `Salle/${c}`),
      ),
    ),
  );
const campaignOf = new Map(imported.map((c) => [c.legacyId.slice('Salle/'.length), c]));

const paths = [...byRoom.values()]
  .flat()
  .filter((d) => /^cartes\/[^/]+\/characters\/[^/]+$/.test(d.path))
  .map((d) => d.path);
const { rows: characterRows } = await characterDb.query<{ legacy_id: string; id: string }>(
  'select legacy_id, character_id as id from characters.legacy_ids where source = $1 and legacy_id = any($2)',
  [LEGACY_SOURCE, paths],
);
const engagedRows = imported.length
  ? await base.db
      .select({ campaignId: campaignCharacters.campaignId, id: campaignCharacters.characterId })
      .from(campaignCharacters)
      .where(
        inArray(
          campaignCharacters.campaignId,
          imported.map((c) => c.id),
        ),
      )
  : [];
const engaged = new Set(engagedRows.map((e) => `${e.campaignId}/${e.id}`));

const accounts = new Map<string, string>();
if (identityDb) {
  const { rows } = await identityDb.query<{ legacy_id: string; id: string }>(
    "select legacy_id, id from identity.legacy_ids where kind = 'firebase_uid'",
  );
  for (const r of rows) accounts.set(r.legacy_id, r.id);
}

// ─── Médias ──────────────────────────────────────────────────────────────────

const rehost = write
  ? mediaRehoster(process.env, {
      types: MAP_MEDIA_TYPES,
      maxSize: 50 * 1024 * 1024,
      folder: 'campaigns/imported/maps',
    })
  : undefined;
const rehosted = new Map<string, Promise<string>>();
const needsRehost = (u: unknown): u is string =>
  typeof u === 'string' && (isFirebaseStorage(u) || isDataUrl(u));

/** Copie les médias Firebase Storage et `data:` dans notre stockage (simulation : compte seulement). */
async function rehostMedia(m: MigratedMaps, warn: (w: string) => void) {
  let count = 0;
  const one = async (url: string | null | undefined, what: string) => {
    if (!needsRehost(url)) return url ?? null;
    count++;
    if (!rehost) {
      if (!write) return isDataUrl(url) ? null : url;
      warn(
        `${what} : stockage S3 non configuré, média ${isDataUrl(url) ? 'retiré' : 'laissé sur Firebase'}`,
      );
      return isDataUrl(url) ? null : url;
    }
    try {
      if (!rehosted.has(url)) rehosted.set(url, rehost(url));
      return await rehosted.get(url)!;
    } catch (err) {
      rehosted.delete(url);
      warn(`${what} : média non rapatrié (${err instanceof Error ? err.message : String(err)})`);
      return isDataUrl(url) ? null : url;
    }
  };
  for (const x of m.maps) x.backgroundUrl = await one(x.backgroundUrl, `Carte ${x.id}`);
  for (const t of m.tokens) {
    t.imageUrl = await one(t.imageUrl, `Token ${t.id}`);
    const audio = t.audio as { url?: string } | null | undefined;
    if (audio?.url && needsRehost(audio.url)) {
      const url = await one(audio.url, `Son du token ${t.id}`);
      t.audio = url && t.audio ? { ...t.audio, url } : null;
    }
  }
  for (const o of m.objects) o.imageUrl = (await one(o.imageUrl, `Objet ${o.id}`)) ?? '';
  for (const z of m.musicZones) z.url = await one(z.url, `Zone sonore ${z.id}`);
  return count;
}

// ─── Import ──────────────────────────────────────────────────────────────────

const report = createWriteStream(values.report, { mode: 0o600 });
const correlationId = uuidv7();
const totals = { campaigns: 0, skipped: 0, errors: 0, warnings: 0, media: 0 };
const producedTotal = emptyCounts();
const writtenTotal = emptyCounts();
const add = (into: Counts, from: Counts) => {
  for (const [n] of TABLES) into[n as TableName] += from[n as TableName];
};

for (const [code, docs] of byRoom) {
  const out: Record<string, unknown> = { legacyId: `Salle/${code}` };
  const campaign = campaignOf.get(code);
  if (!campaign) {
    out.status = 'no-campaign';
    totals.skipped++;
    report.write(JSON.stringify(out) + '\n');
    continue;
  }
  try {
    const characters = new Map<string, { id: string; engaged: boolean }>();
    for (const r of characterRows)
      if (r.legacy_id.startsWith(`cartes/${code}/`))
        characters.set(r.legacy_id, { id: r.id, engaged: engaged.has(`${campaign.id}/${r.id}`) });
    const migrated = transformRoom(code, docs, rtdbRooms[code], {
      campaignId: campaign.id,
      ownerId: campaign.ownerId,
      characters,
      accounts,
    });
    const warnings = migrated.warnings;
    totals.media += await rehostMedia(migrated, (w) => warnings.push(w));
    const counts = produced(migrated);
    add(producedTotal, counts);
    Object.assign(out, { id: campaign.id, produced: counts });
    if (write) {
      const written = await loadMaps(base.db, campaign.id, migrated, correlationId);
      add(writtenTotal, written);
      Object.assign(out, { status: 'imported', written });
    } else {
      Object.assign(out, { status: 'dry-run', alreadyImported: await existing(base.db, migrated) });
    }
    out.warnings = warnings;
    totals.warnings += warnings.length;
    totals.campaigns++;
  } catch (err) {
    totals.errors++;
    out.status = 'error';
    out.error = err instanceof Error ? err.message : String(err);
  }
  report.write(JSON.stringify(out) + '\n');
}

await new Promise((ok) => report.end(ok));
await base.pool.end();
await characterDb.end();
await identityDb?.end();

const fmt = (c: Counts) =>
  TABLES.map(([n]) => `${n} ${c[n]}`)
    .filter((s) => !s.endsWith(' 0'))
    .join(', ') || 'rien';
console.log(`Campagnes : ${totals.campaigns}, salles sans campagne importée : ${totals.skipped}`);
console.log(`Lignes produites : ${fmt(producedTotal)}`);
console.log(
  write
    ? `Lignes écrites : ${fmt(writtenTotal)} (le reste existait déjà)`
    : "Simulation : rien n'a été écrit (--importer pour importer)",
);
console.log(
  `Médias à rapatrier : ${totals.media}, avertissements : ${totals.warnings}, erreurs : ${totals.errors}`,
);
console.log(`Rapport : ${values.report}`);
if (totals.errors) process.exitCode = 1;
