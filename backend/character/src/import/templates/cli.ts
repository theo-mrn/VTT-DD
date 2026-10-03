/**
 * Import des modèles du MJ (PNJ, catégories, objets) de Firebase dans le
 * service character, APRÈS les campagnes (campaign) :
 *
 *   node --env-file=backend/character/.env backend/character/dist/import/templates/cli.js \
 *     --export ~/vtt-export --report ~/vtt-export/rapport-modeles.ndjson [--importer]
 *
 *   --export    dossier des exports NDJSON de tools/firebase-export :
 *               npc_templates et object_templates (récursifs) ; Salle et
 *               gameSystems (facultatifs : sens des jauges du système de la salle)
 *   --report    rapport par document (statut, avertissements), fichier 0600
 *   --importer  écrit en base ; sans lui, simulation (rien n'est écrit)
 *
 * Environnement :
 *   CAMPAIGN_DATABASE_URL  rôle campaign_svc : campagne importée de chaque salle
 *                          et son système (lecture seule)
 *   DATABASE_URL           rôle characters_svc (écriture ; en simulation, lecture
 *                          des modèles déjà importés si elle est fournie)
 *   S3_*                   stockage : images Firebase Storage et `data:` rapatriées
 * La sortie ne contient que des compteurs ; le détail est dans le rapport.
 * Rejouable : les modèles déjà importés (même UUIDv5) sont ignorés.
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { uuidv7 } from '@vtt/contracts';
import { inArray } from 'drizzle-orm';
import pg from 'pg';
import { createDb } from '../../db/client.js';
import { npcTemplateCategories, npcTemplates, objectTemplates } from '../../db/schema.js';
import { catalogueReference } from '../../regles/catalogue.js';
import { envoyeurImages, estFirebaseStorage, ImageDisparue, telechargerImage } from '../images.js';
import { texte, type DocFirestore } from '../legacy.js';
import { loadCampaignTemplates, type CampaignTemplates } from './load.js';
import {
  classify,
  importedId,
  transformCategory,
  transformNpcTemplate,
  transformObjectTemplate,
  type LegacyKind,
  type LegacyNpcTemplate,
} from './transform.js';

const { values } = parseArgs({
  options: {
    export: { type: 'string' },
    report: { type: 'string' },
    importer: { type: 'boolean', default: false },
  },
});
if (!values.export || !values.report) {
  console.error('usage : cli.js --export <dossier> --report <fichier> [--importer]');
  process.exit(2);
}
const write = values.importer;
const env = {
  campaign: process.env.CAMPAIGN_DATABASE_URL || undefined,
  character: process.env.DATABASE_URL || undefined,
};
const missing = [
  !env.campaign && 'CAMPAIGN_DATABASE_URL (campaign_svc)',
  write && !env.character && 'DATABASE_URL (characters_svc)',
].filter(Boolean);
if (missing.length) {
  console.error(`Manquant : ${missing.join(', ')}`);
  process.exit(2);
}

// ─── Lecture des exports ─────────────────────────────────────────────────────

/** Documents d'un export NDJSON ; `keep` filtre à la lecture (gros fichiers). */
async function read(name: string, keep: (d: DocFirestore) => boolean = () => true) {
  const file = join(values.export!, `${name}.ndjson`);
  const docs: DocFirestore[] = [];
  if (!existsSync(file)) {
    console.warn(`  (absent : ${name}.ndjson)`);
    return docs;
  }
  let line = 0;
  for await (const text of createInterface({ input: createReadStream(file, 'utf8') })) {
    line++;
    if (!text.trim()) continue;
    let doc: DocFirestore;
    try {
      const { path, id, data } = JSON.parse(text) as DocFirestore;
      doc = { path: path ?? id, id, data: data ?? {} };
    } catch {
      throw new Error(`${file}:${line} : JSON invalide`);
    }
    if (keep(doc)) docs.push(doc);
  }
  return docs;
}

console.log('Lecture des exports…');
const byRoom = new Map<string, { kind: LegacyKind; doc: DocFirestore }[]>();
for (const doc of [...(await read('npc_templates')), ...(await read('object_templates'))]) {
  const c = classify(doc.path);
  if (!c) continue;
  const list = byRoom.get(c.roomCode) ?? [];
  list.push({ kind: c.kind, doc });
  byRoom.set(c.roomCode, list);
}
const topLevel = (d: DocFirestore) => d.path.split('/').length === 2;
const rooms = new Map(
  (await read('Salle', (d) => topLevel(d) && byRoom.has(d.id))).map((d) => [d.id, d.data]),
);
const gameSystems = new Map((await read('gameSystems', topLevel)).map((d) => [d.id, d.data]));
const total = [...byRoom.values()].reduce((n, l) => n + l.length, 0);
console.log(`${total} document(s) de modèles dans ${byRoom.size} salle(s)`);

// ─── Correspondances (lecture seule) ─────────────────────────────────────────

const campaignDb = new pg.Pool({ connectionString: env.campaign, max: 2 });
const { rows: campaignRows } = await campaignDb.query<{
  legacy_id: string;
  id: string;
  system_id: string;
}>(
  `select l.legacy_id, c.id, c.system_id
     from campaign.legacy_ids l join campaign.campaigns c on c.id = l.campaign_id
    where l.source = 'firebase' and l.legacy_id = any($1)`,
  [[...byRoom.keys()].map((code) => `Salle/${code}`)],
);
await campaignDb.end();
const campaignOf = new Map(campaignRows.map((r) => [r.legacy_id.slice('Salle/'.length), r]));

const base = env.character ? createDb(env.character) : null;
const catalogue = catalogueReference();

// ─── Images ──────────────────────────────────────────────────────────────────

const send = write ? envoyeurImages() : undefined;
const rehosted = new Map<string, Promise<string>>();
let imagesToRehost = 0;

/**
 * Image Firebase Storage ou `data:` copiée dans notre stockage (simulation :
 * comptée seulement). Les autres adresses (actifs publics, sites tiers) restent.
 */
async function rehost(url: string | null, what: string, warn: (w: string) => void) {
  if (!url) return null;
  if (url.startsWith('/')) {
    warn(`${what} « ${url} » : image de l'ancienne app, à reprendre dans le stockage`);
    return url;
  }
  const embedded = url.startsWith('data:');
  if (!embedded && !estFirebaseStorage(url)) return url;
  imagesToRehost++;
  if (!write) return embedded ? null : url;
  if (!send) {
    warn(
      `${what} : stockage S3 non configuré, image ${embedded ? 'retirée' : 'laissée sur Firebase'}`,
    );
    return embedded ? null : url;
  }
  try {
    if (!rehosted.has(url))
      rehosted.set(url, embedded ? send(url) : telechargerImage(url).then((d) => send(d)));
    return await rehosted.get(url)!;
  } catch (err) {
    rehosted.delete(url);
    if (err instanceof ImageDisparue) {
      warn(`${what} : image disparue (404), retirée`);
      return null;
    }
    warn(`${what} : image non rapatriée (${err instanceof Error ? err.message : String(err)})`);
    return embedded ? null : url;
  }
}

// ─── Conversion et écriture, salle par salle ─────────────────────────────────

/** Lignes déjà présentes parmi `ids` (sans base en simulation : aucune). */
async function existingIds(ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  if (!base || !ids.length) return found;
  for (const table of [npcTemplateCategories, npcTemplates, objectTemplates] as const) {
    const rows = await base.db
      .select({ id: table.id })
      .from(table as typeof npcTemplates)
      .where(inArray(table.id, ids));
    for (const r of rows) found.add(r.id);
  }
  return found;
}

const report = createWriteStream(values.report, { mode: 0o600 });
const correlationId = uuidv7();
const counts = {
  noCampaign: 0,
  unknownSystem: 0,
  imported: { categories: 0, npcTemplates: 0, objectTemplates: 0 },
  already: { categories: 0, npcTemplates: 0, objectTemplates: 0 },
  toImport: { categories: 0, npcTemplates: 0, objectTemplates: 0 },
  warnings: 0,
  errors: 0,
};
const bucket = {
  npc_category: 'categories',
  npc_template: 'npcTemplates',
  object_template: 'objectTemplates',
} as const;
const line = (o: Record<string, unknown>) => report.write(JSON.stringify(o) + '\n');

for (const [code, docs] of byRoom) {
  const campaign = campaignOf.get(code);
  if (!campaign) {
    counts.noCampaign += docs.length;
    for (const { kind, doc } of docs) line({ legacyId: doc.path, kind, status: 'sans-campagne' });
    continue;
  }
  const systeme = catalogue.charge(campaign.system_id);
  if (!systeme) {
    counts.unknownSystem += docs.length;
    for (const { kind, doc } of docs)
      line({ legacyId: doc.path, kind, status: 'systeme-non-migre', systeme: campaign.system_id });
    continue;
  }

  const room = rooms.get(code) ?? {};
  const gameSystemId = texte(room.gameSystemId);
  const stats = gameSystemId ? gameSystems.get(gameSystemId)?.stats : undefined;
  const categoryPaths = new Set(
    docs.filter((d) => d.kind === 'npc_category').map((d) => d.doc.path),
  );
  const m: CampaignTemplates = { categories: [], npcTemplates: [], objectTemplates: [] };
  const warningsOf = new Map<string, string[]>();

  // Déjà en base (même UUIDv5) : écrit à un import précédent, images comprises
  const existing = await existingIds(docs.map((d) => importedId(d.doc.path)));
  const rehostNew = (id: string, url: string | null, what: string, warn: (w: string) => void) =>
    existing.has(id) ? Promise.resolve(url) : rehost(url, what, warn);

  for (const { kind, doc } of docs) {
    try {
      if (kind === 'npc_category') {
        const c = transformCategory(doc);
        m.categories.push(c);
        warningsOf.set(c.id, c.warnings);
      } else if (kind === 'object_template') {
        const o = transformObjectTemplate(doc);
        const warn = (w: string) => o.warnings.push(w);
        o.imageUrl = await rehostNew(o.id, o.imageUrl, 'Image', warn);
        m.objectTemplates.push(o);
        warningsOf.set(o.id, o.warnings);
      } else {
        const t = transformNpcTemplate(doc as DocFirestore<LegacyNpcTemplate>, {
          systemId: systeme.source.id,
          systemes: { [systeme.source.id]: systeme },
          ...(Array.isArray(stats)
            ? { statsSalle: stats as { key: string; recoversToZero?: boolean }[] }
            : {}),
          categories: categoryPaths,
        });
        const warn = (w: string) => t.warnings.push(w);
        t.imageUrl = await rehostNew(t.id, t.imageUrl, 'Portrait', warn);
        t.tokenUrl = await rehostNew(t.id, t.tokenUrl, 'Jeton', warn);
        m.npcTemplates.push(t);
        warningsOf.set(t.id, t.warnings);
      }
    } catch (err) {
      counts.errors++;
      line({
        legacyId: doc.path,
        kind,
        status: 'erreur',
        erreur: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const inserted = new Set<string>();
  if (write) {
    const r = await loadCampaignTemplates(base!.db, campaign.id, m, correlationId);
    for (const id of [...r.categories, ...r.npcTemplates, ...r.objectTemplates]) inserted.add(id);
  }

  for (const [kind, list] of [
    ['npc_category', m.categories],
    ['npc_template', m.npcTemplates],
    ['object_template', m.objectTemplates],
  ] as const) {
    for (const x of list) {
      let status: 'importe' | 'deja-importe' | 'a-importer' = 'a-importer';
      if (inserted.has(x.id)) status = 'importe';
      else if (existing.has(x.id) || write) status = 'deja-importe';
      const key = bucket[kind];
      if (status === 'importe') counts.imported[key]++;
      else if (status === 'deja-importe') counts.already[key]++;
      else counts.toImport[key]++;
      const warnings = warningsOf.get(x.id) ?? [];
      counts.warnings += warnings.length;
      line({ legacyId: x.legacyId, kind, status, id: x.id, campaignId: campaign.id, warnings });
    }
  }
}

await new Promise((ok) => report.end(ok));
await base?.pool.end();

const fmt = (c: { categories: number; npcTemplates: number; objectTemplates: number }) =>
  `${c.categories} catégorie(s), ${c.npcTemplates} modèle(s) de PNJ, ${c.objectTemplates} modèle(s) d'objet`;
console.log(`Salles sans campagne importée : ${counts.noCampaign} document(s) écarté(s)`);
if (counts.unknownSystem)
  console.log(`Système de campagne non migré : ${counts.unknownSystem} document(s) écarté(s)`);
if (write) console.log(`Importés : ${fmt(counts.imported)}`);
else console.log(`Simulation, rien n'a été écrit. À importer : ${fmt(counts.toImport)}`);
console.log(`Déjà importés : ${fmt(counts.already)}`);
console.log(
  `Images à rapatrier : ${imagesToRehost} ; avertissements : ${counts.warnings} ; erreurs : ${counts.errors}`,
);
console.log(`Rapport : ${values.report}`);
if (counts.errors) process.exitCode = 1;
