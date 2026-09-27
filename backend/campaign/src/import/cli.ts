/**
 * Import des campagnes Firebase dans le service campaign, APRÈS les comptes
 * (identity) et les personnages (character).
 *
 *   node --env-file=backend/campaign/.env backend/campaign/dist/import/cli.js \
 *     --export ~/vtt-export --report ~/vtt-export/rapport-campagnes.ndjson [--dry-run]
 *
 *   --export   dossier des exports NDJSON de tools/firebase-export :
 *              Salle, salles, users, cartes, gameSystems (récursifs)
 *   --report   rapport par campagne (statut, code, avertissements)
 *   --dry-run  convertit et produit le rapport sans rien écrire en base
 *
 * Environnement :
 *   DATABASE_URL           rôle campaign_svc (écriture ; en simulation, lecture de legacy_ids)
 *   IDENTITY_DATABASE_URL  rôle identity_svc : compte migré de chaque UID Firebase
 *   CHARACTER_DATABASE_URL rôle characters_svc : personnages importés
 * En simulation, les correspondances sont vérifiées si les deux dernières sont
 * fournies (lecture seule). Rejouable : les campagnes déjà importées sont ignorées.
 *
 * Sous-commande `maps` : import des cartes, une fois les campagnes importées
 * (voir src/import/maps/cli.ts ; simulation par défaut, --importer pour écrire).
 * Sous-commande `notes` : import des notes (Notes, SharedNotes), une fois les
 * campagnes importées (voir src/import/notes/cli.ts ; même principe).
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { uuidv7 } from '@vtt/contracts';
import pg from 'pg';
import { createDb } from '../db/client.js';
import { referenceCatalog } from '../systems/catalog.js';
import { groupCampaigns, type CampaignExports } from './grouping.js';
import type { FirestoreDoc } from './legacy.js';
import {
  alreadyImported,
  LEGACY_SOURCE,
  loadCampaign,
  prepareCampaign,
  type ImportedCharacter,
  type Mappings,
} from './loading.js';
import { transformCampaign } from './transform.js';
import { imageRehoster, isFirebaseStorage } from './images.js';

if (process.argv[2] === 'maps') {
  await import('./maps/cli.js');
  process.exit();
}
if (process.argv[2] === 'notes') {
  await import('./notes/cli.js');
  process.exit();
}

const { values } = parseArgs({
  options: {
    export: { type: 'string' },
    report: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.export || !values.report) {
  console.error('usage : cli.js --export <dossier> --report <fichier> [--dry-run]');
  process.exit(2);
}
const dryRun = values['dry-run'];
const rehost = dryRun ? undefined : imageRehoster();
const env = {
  campaign: process.env.DATABASE_URL || undefined,
  identity: process.env.IDENTITY_DATABASE_URL || undefined,
  character: process.env.CHARACTER_DATABASE_URL || undefined,
};
if (!dryRun) {
  const missing = [
    !env.campaign && 'DATABASE_URL (campaign_svc)',
    !env.identity && 'IDENTITY_DATABASE_URL (identity_svc)',
    !env.character && 'CHARACTER_DATABASE_URL (characters_svc)',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`Manquant : ${missing.join(', ')}`);
    process.exit(2);
  }
}

const depth = (path: string) => path.split('/').length;

/** Lit un export en flux, en ne gardant que les documents utiles (cartes est volumineux). */
async function read(
  name: string,
  keep: (path: string) => boolean = () => true,
  required = false,
): Promise<FirestoreDoc[]> {
  const file = join(values.export!, `${name}.ndjson`);
  if (!existsSync(file)) {
    if (required) {
      console.error(`${file} introuvable : lance d'abord pnpm import:personnages`);
      process.exit(1);
    }
    console.warn(`  (absent : ${name}.ndjson)`);
    return [];
  }
  const docs: FirestoreDoc[] = [];
  let i = 0;
  for await (const line of createInterface({ input: createReadStream(file, 'utf8') })) {
    i++;
    if (!line.trim()) continue;
    let doc: FirestoreDoc;
    try {
      const { path, id, data } = JSON.parse(line) as FirestoreDoc;
      doc = { path: path ?? id, id, data };
    } catch {
      throw new Error(`${file}:${i} : JSON invalide`);
    }
    if (keep(doc.path)) docs.push(doc);
  }
  return docs;
}

console.log('Lecture des exports…');
const exports: CampaignExports = {
  campaigns: await read('Salle', () => true, true),
  names: await read('salles', (p) => /^salles\/[^/]+\/Noms\/[^/]+$/.test(p)),
  users: await read('users', (p) => depth(p) === 2 || /^users\/[^/]+\/rooms\/[^/]+$/.test(p)),
  maps: await read('cartes', (p) => /^cartes\/[^/]+\/characters\/[^/]+$/.test(p)),
  systems: await read('gameSystems', (p) => depth(p) === 2),
};
const { campaigns, orphans } = groupCampaigns(exports);
console.log(
  `${campaigns.length} campagne(s) trouvée(s), ${orphans.length} code(s) sans campagne ignoré(s)`,
);

// ─── Correspondances (lecture seule) ─────────────────────────────────────────

const identityDb = env.identity ? new pg.Pool({ connectionString: env.identity, max: 2 }) : null;
const characterDb = env.character ? new pg.Pool({ connectionString: env.character, max: 2 }) : null;
const verify = !!identityDb && !!characterDb;
if (dryRun && !verify)
  console.warn(
    '  (comptes et personnages non vérifiés : IDENTITY_ et CHARACTER_DATABASE_URL absents)',
  );

const accounts = new Map<string, string>();
const characters = new Map<string, ImportedCharacter>();
if (verify) {
  const uids = new Set<string>();
  const paths: string[] = [];
  for (const c of campaigns) {
    const d = c.doc.data ?? {};
    if (typeof d.creatorId === 'string') uids.add(d.creatorId);
    for (const m of c.members) uids.add(m.uid);
    for (const b of Array.isArray(d.bannedUsers) ? d.bannedUsers : []) uids.add(String(b));
    for (const m of c.messages) if (typeof m.data?.uid === 'string') uids.add(m.data.uid);
    for (const p of c.characters) paths.push(p.path);
  }
  const r = await identityDb.query<{ legacy_id: string; id: string }>(
    "select legacy_id, id from identity.legacy_ids where kind = 'firebase_uid' and legacy_id = any($1)",
    [[...uids]],
  );
  for (const x of r.rows) accounts.set(x.legacy_id, x.id);
  const p = await characterDb.query<{
    legacy_id: string;
    id: string;
    owner_id: string;
    system_id: string;
  }>(
    `select l.legacy_id, c.id, c.owner_id, c.system_id
       from characters.legacy_ids l join characters.characters c on c.id = l.character_id
      where l.source = $1 and l.legacy_id = any($2)`,
    [LEGACY_SOURCE, paths],
  );
  for (const x of p.rows)
    characters.set(x.legacy_id, { id: x.id, ownerId: x.owner_id, systemId: x.system_id });
  console.log(
    `Comptes migrés : ${accounts.size}/${uids.size}, personnages importés : ${characters.size}/${paths.length}`,
  );
}
const mappings: Mappings = { accounts, characters };

// ─── Import ──────────────────────────────────────────────────────────────────

const catalog = referenceCatalog();
const base = env.campaign ? createDb(env.campaign) : null;
const report = createWriteStream(values.report, { mode: 0o600 });
const correlationId = uuidv7();
const totals = {
  imported: 0,
  alreadyImported: 0,
  noAccount: 0,
  errors: 0,
  warnings: 0,
};
const bySystem: Record<string, number> = {};

for (const c of campaigns) {
  const line: Record<string, unknown> = { legacyId: c.legacyId, code: c.code };
  try {
    const migrated = transformCampaign(c);
    const system = catalog.system(migrated.systemId);
    if (!system) throw new Error(`Système ${migrated.systemId} absent du catalogue`);
    Object.assign(line, {
      name: migrated.name,
      system: migrated.systemId,
      members: migrated.members.length,
      characters: migrated.characters.length,
      sessions: migrated.sessions.length,
      messages: migrated.messages.length,
    });
    bySystem[migrated.systemId] = (bySystem[migrated.systemId] ?? 0) + 1;

    const existing = base ? await alreadyImported(base.db, c.legacyId) : undefined;
    let warnings = migrated.warnings;
    if (existing) {
      Object.assign(line, { status: 'already-imported', id: existing });
      totals.alreadyImported++;
    } else if (dryRun && !verify) {
      line.status = 'dry-run';
    } else {
      const prep = prepareCampaign(migrated, mappings, system.version);
      warnings = prep.warnings;
      if (prep.status === 'no-account') {
        line.status = 'no-account';
        totals.noAccount++;
      } else {
        Object.assign(line, {
          members: prep.campaign.members.length,
          characters: prep.campaign.characters.length,
          played: prep.campaign.characters.filter((x) => x.playedBy).length,
          messages: prep.campaign.messages.length,
        });
        if (dryRun) line.status = 'dry-run';
        else {
          // Image encore sur Firebase Storage : copiée dans notre stockage
          if (isFirebaseStorage(prep.campaign.campaign.imageUrl)) {
            if (!rehost)
              warnings = [
                ...warnings,
                'Image laissée sur Firebase Storage : stockage S3 non configuré',
              ];
            else
              try {
                prep.campaign.campaign.imageUrl = await rehost(prep.campaign.campaign.imageUrl);
                warnings = warnings.filter((w) => !w.includes('Firebase Storage'));
              } catch (err) {
                warnings = [
                  ...warnings,
                  `Image non rapatriée (${err instanceof Error ? err.message : String(err)})`,
                ];
              }
          }
          const r = await loadCampaign(base!.db, prep.campaign, c.legacyId, correlationId);
          Object.assign(line, { status: r.status, id: r.id });
          if (r.status === 'imported') {
            line.code = r.code;
            warnings = [...warnings, ...r.warnings];
            totals.imported++;
          } else totals.alreadyImported++;
        }
      }
    }
    line.warnings = warnings;
    totals.warnings += warnings.length;
  } catch (err) {
    totals.errors++;
    line.status = 'error';
    line.error = err instanceof Error ? err.message : String(err);
  }
  report.write(JSON.stringify(line) + '\n');
}

await new Promise((ok) => report.end(ok));
await base?.pool.end();
await identityDb?.end();
await characterDb?.end();

console.log(`Par système : ${JSON.stringify(bySystem)}`);
console.log(
  dryRun
    ? `Simulation : rien n'a été écrit. Déjà importées : ${totals.alreadyImported}, ` +
        `sans compte migré : ${totals.noAccount}, ${totals.warnings} avertissement(s), ` +
        `${totals.errors} erreur(s).`
    : `Importées : ${totals.imported}, déjà importées : ${totals.alreadyImported}, ` +
        `sans compte migré : ${totals.noAccount}, erreurs : ${totals.errors}.`,
);
console.log(`Rapport : ${values.report}`);
if (totals.errors) process.exitCode = 1;
