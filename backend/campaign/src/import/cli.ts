/**
 * Import des salles Firebase dans le service campaign, APRÈS les comptes
 * (identity) et les personnages (character).
 *
 *   node --env-file=backend/campaign/.env backend/campaign/dist/import/cli.js \
 *     --export ~/vtt-export --rapport ~/vtt-export/rapport-salles.ndjson [--simulation]
 *
 *   --export      dossier des exports NDJSON de tools/firebase-export :
 *                 Salle, salles, users, cartes, gameSystems (récursifs)
 *   --rapport     rapport par salle (statut, code, avertissements)
 *   --simulation  convertit et produit le rapport sans rien écrire en base
 *
 * Environnement :
 *   DATABASE_URL           rôle campaign_svc (écriture ; en simulation, lecture de legacy_ids)
 *   IDENTITY_DATABASE_URL  rôle identity_svc : compte migré de chaque UID Firebase
 *   CHARACTER_DATABASE_URL rôle characters_svc : personnages importés
 * En simulation, les correspondances sont vérifiées si les deux dernières sont
 * fournies (lecture seule). Rejouable : les salles déjà importées sont ignorées.
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { uuidv7 } from '@vtt/contracts';
import pg from 'pg';
import { createDb } from '../db/client.js';
import { catalogueReference } from '../systemes/catalogue.js';
import {
  chargerSalle,
  dejaImportee,
  preparerSalle,
  SOURCE_LEGACY,
  type Correspondances,
  type PersonnageImporte,
} from './chargement.js';
import type { DocFirestore } from './legacy.js';
import { regrouperSalles, type ExportsSalles } from './regroupement.js';
import { transformerSalle } from './transformer.js';

const { values } = parseArgs({
  options: {
    export: { type: 'string' },
    rapport: { type: 'string' },
    simulation: { type: 'boolean', default: false },
  },
});
if (!values.export || !values.rapport) {
  console.error('usage : cli.js --export <dossier> --rapport <fichier> [--simulation]');
  process.exit(2);
}
const simulation = values.simulation;
const env = {
  campaign: process.env.DATABASE_URL || undefined,
  identity: process.env.IDENTITY_DATABASE_URL || undefined,
  character: process.env.CHARACTER_DATABASE_URL || undefined,
};
if (!simulation) {
  const manquantes = [
    !env.campaign && 'DATABASE_URL (campaign_svc)',
    !env.identity && 'IDENTITY_DATABASE_URL (identity_svc)',
    !env.character && 'CHARACTER_DATABASE_URL (characters_svc)',
  ].filter(Boolean);
  if (manquantes.length) {
    console.error(`Manquant : ${manquantes.join(', ')}`);
    process.exit(2);
  }
}

const profondeur = (path: string) => path.split('/').length;

/** Lit un export en flux, en ne gardant que les documents utiles (cartes est volumineux). */
async function lire(
  nom: string,
  garder: (path: string) => boolean = () => true,
  obligatoire = false,
): Promise<DocFirestore[]> {
  const fichier = join(values.export!, `${nom}.ndjson`);
  if (!existsSync(fichier)) {
    if (obligatoire) {
      console.error(`${fichier} introuvable : lance d'abord pnpm import:personnages`);
      process.exit(1);
    }
    console.warn(`  (absent : ${nom}.ndjson)`);
    return [];
  }
  const docs: DocFirestore[] = [];
  let i = 0;
  for await (const ligne of createInterface({ input: createReadStream(fichier, 'utf8') })) {
    i++;
    if (!ligne.trim()) continue;
    let doc: DocFirestore;
    try {
      const { path, id, data } = JSON.parse(ligne) as DocFirestore;
      doc = { path: path ?? id, id, data };
    } catch {
      throw new Error(`${fichier}:${i} : JSON invalide`);
    }
    if (garder(doc.path)) docs.push(doc);
  }
  return docs;
}

console.log('Lecture des exports…');
const exports: ExportsSalles = {
  salles: await lire('Salle', () => true, true),
  noms: await lire('salles', (p) => /^salles\/[^/]+\/Noms\/[^/]+$/.test(p)),
  users: await lire('users', (p) => profondeur(p) === 2 || /^users\/[^/]+\/rooms\/[^/]+$/.test(p)),
  cartes: await lire('cartes', (p) => /^cartes\/[^/]+\/characters\/[^/]+$/.test(p)),
  systemes: await lire('gameSystems', (p) => profondeur(p) === 2),
};
const { salles, orphelines } = regrouperSalles(exports);
console.log(
  `${salles.length} salle(s) trouvée(s), ${orphelines.length} code(s) sans salle ignoré(s)`,
);

// ─── Correspondances (lecture seule) ─────────────────────────────────────────

const identite = env.identity ? new pg.Pool({ connectionString: env.identity, max: 2 }) : null;
const personnagesDb = env.character
  ? new pg.Pool({ connectionString: env.character, max: 2 })
  : null;
const verifier = !!identite && !!personnagesDb;
if (simulation && !verifier)
  console.warn(
    '  (comptes et personnages non vérifiés : IDENTITY_ et CHARACTER_DATABASE_URL absents)',
  );

const comptes = new Map<string, string>();
const personnages = new Map<string, PersonnageImporte>();
if (verifier) {
  const uids = new Set<string>();
  const chemins: string[] = [];
  for (const s of salles) {
    const d = s.doc.data ?? {};
    if (typeof d.creatorId === 'string') uids.add(d.creatorId);
    for (const m of s.membres) uids.add(m.uid);
    for (const b of Array.isArray(d.bannedUsers) ? d.bannedUsers : []) uids.add(String(b));
    for (const m of s.messages) if (typeof m.data?.uid === 'string') uids.add(m.data.uid);
    for (const p of s.personnages) chemins.push(p.path);
  }
  const r = await identite.query<{ legacy_id: string; id: string }>(
    "select legacy_id, id from identity.legacy_ids where kind = 'firebase_uid' and legacy_id = any($1)",
    [[...uids]],
  );
  for (const x of r.rows) comptes.set(x.legacy_id, x.id);
  const p = await personnagesDb.query<{
    legacy_id: string;
    id: string;
    owner_id: string;
    system_id: string;
  }>(
    `select l.legacy_id, c.id, c.owner_id, c.system_id
       from characters.legacy_ids l join characters.characters c on c.id = l.character_id
      where l.source = $1 and l.legacy_id = any($2)`,
    [SOURCE_LEGACY, chemins],
  );
  for (const x of p.rows)
    personnages.set(x.legacy_id, { id: x.id, ownerId: x.owner_id, systemId: x.system_id });
  console.log(
    `Comptes migrés : ${comptes.size}/${uids.size}, personnages importés : ${personnages.size}/${chemins.length}`,
  );
}
const correspondances: Correspondances = { comptes, personnages };

// ─── Import ──────────────────────────────────────────────────────────────────

const catalogue = catalogueReference();
const base = env.campaign ? createDb(env.campaign) : null;
const rapport = createWriteStream(values.rapport, { mode: 0o600 });
const correlationId = uuidv7();
const bilan = {
  importees: 0,
  dejaImportees: 0,
  sansCompte: 0,
  erreurs: 0,
  avertissements: 0,
};
const parSysteme: Record<string, number> = {};

for (const a of salles) {
  const ligne: Record<string, unknown> = { legacyId: a.legacyId, code: a.code };
  try {
    const migree = transformerSalle(a);
    const systeme = catalogue.systeme(migree.systemeId);
    if (!systeme) throw new Error(`Système ${migree.systemeId} absent du catalogue`);
    Object.assign(ligne, {
      nom: migree.nom,
      systeme: migree.systemeId,
      membres: migree.membres.length,
      personnages: migree.personnages.length,
      sessions: migree.sessions.length,
      messages: migree.messages.length,
    });
    parSysteme[migree.systemeId] = (parSysteme[migree.systemeId] ?? 0) + 1;

    const existant = base ? await dejaImportee(base.db, a.legacyId) : undefined;
    let avertissements = migree.avertissements;
    if (existant) {
      Object.assign(ligne, { statut: 'deja-importe', id: existant });
      bilan.dejaImportees++;
    } else if (simulation && !verifier) {
      ligne.statut = 'simule';
    } else {
      const prep = preparerSalle(migree, correspondances, systeme.version);
      avertissements = prep.avertissements;
      if (prep.statut === 'sans-compte') {
        ligne.statut = 'sans-compte';
        bilan.sansCompte++;
      } else {
        Object.assign(ligne, {
          membres: prep.salle.membres.length,
          personnages: prep.salle.personnages.length,
          incarnes: prep.salle.personnages.filter((x) => x.incarnePar).length,
          messages: prep.salle.messages.length,
        });
        if (simulation) ligne.statut = 'simule';
        else {
          const r = await chargerSalle(base!.db, prep.salle, a.legacyId, correlationId);
          Object.assign(ligne, { statut: r.statut, id: r.id });
          if (r.statut === 'importe') {
            ligne.code = r.code;
            avertissements = [...avertissements, ...r.avertissements];
            bilan.importees++;
          } else bilan.dejaImportees++;
        }
      }
    }
    ligne.avertissements = avertissements;
    bilan.avertissements += avertissements.length;
  } catch (err) {
    bilan.erreurs++;
    ligne.statut = 'erreur';
    ligne.erreur = err instanceof Error ? err.message : String(err);
  }
  rapport.write(JSON.stringify(ligne) + '\n');
}

await new Promise((ok) => rapport.end(ok));
await base?.pool.end();
await identite?.end();
await personnagesDb?.end();

console.log(`Par système : ${JSON.stringify(parSysteme)}`);
console.log(
  simulation
    ? `Simulation : rien n'a été écrit. Déjà importées : ${bilan.dejaImportees}, ` +
        `sans compte migré : ${bilan.sansCompte}, ${bilan.avertissements} avertissement(s), ` +
        `${bilan.erreurs} erreur(s).`
    : `Importées : ${bilan.importees}, déjà importées : ${bilan.dejaImportees}, ` +
        `sans compte migré : ${bilan.sansCompte}, erreurs : ${bilan.erreurs}.`,
);
console.log(`Rapport : ${values.rapport}`);
if (bilan.erreurs) process.exitCode = 1;
