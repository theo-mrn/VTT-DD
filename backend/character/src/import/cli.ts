/**
 * Import des personnages Firebase dans le service character.
 *
 *   node --env-file=backend/character/.env backend/character/dist/import/cli.js \
 *     --export ~/vtt-export --rapport ~/vtt-export/rapport-personnages.ndjson [--simulation]
 *
 *   --export      dossier des exports NDJSON de tools/firebase-export :
 *                 cartes, users, Salle, gameSystems, Inventaire, Bonus (récursifs)
 *   --rapport     rapport par personnage (statut, propriétaire, avertissements)
 *   --simulation  convertit et produit le rapport sans rien écrire en base
 *                 (la reprise des personnages déjà importés est calculée, sans écriture,
 *                 si DATABASE_URL est défini)
 *
 * Environnement : DATABASE_URL (rôle characters_svc) et IDENTITY_DATABASE_URL
 * (rôle identity_svc) pour retrouver le compte migré de chaque UID Firebase.
 * Rejouable : un personnage déjà importé n'est pas recréé, mais repris (voir
 * reprise.ts) : objets legacy non encore repris, bourse convertie en pièces.
 */
import { createWriteStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { uuidv7 } from '@vtt/contracts';
import { systeme } from '@vtt/systemes';
import { envoyeurImages } from './images.js';
import pg from 'pg';
import { createDb } from '../db/client.js';
import { and, eq } from 'drizzle-orm';
import { legacyIds } from '../db/schema.js';
import { chargerPersonnage, SOURCE_LEGACY } from './chargement.js';
import { reprendrePersonnage, type BilanReprise } from './reprise.js';
import type { DocFirestore } from './legacy.js';
import { regrouperPersonnages, type Exports } from './regroupement.js';
import { detecterSysteme, SYSTEMES_MIGRES, transformerPersonnage } from './transformer.js';

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

async function lire(nom: string): Promise<DocFirestore[]> {
  const fichier = join(values.export!, `${nom}.ndjson`);
  if (!existsSync(fichier)) {
    console.warn(`  (absent : ${nom}.ndjson)`);
    return [];
  }
  const docs: DocFirestore[] = [];
  for (const [i, ligne] of (await readFile(fichier, 'utf8')).split('\n').entries()) {
    if (!ligne.trim()) continue;
    try {
      const { path, id, data } = JSON.parse(ligne) as DocFirestore;
      docs.push({ path: path ?? id, id, data });
    } catch {
      throw new Error(`${fichier}:${i + 1} : JSON invalide`);
    }
  }
  return docs;
}

console.log('Lecture des exports…');
const exports: Exports = {
  cartes: await lire('cartes'),
  users: await lire('users'),
  salles: await lire('Salle'),
  systemes: await lire('gameSystems'),
  inventaire: await lire('Inventaire'),
  bonus: await lire('Bonus'),
  noms: await lire('salles'),
};
const aImporter = regrouperPersonnages(exports);
console.log(`${aImporter.length} personnage(s) trouvé(s)`);

const systemes = Object.fromEntries(SYSTEMES_MIGRES.map((id) => [id, systeme(id)]));

// UID Firebase → compte migré (identity.legacy_ids)
const identite = values.simulation
  ? null
  : new pg.Pool({ connectionString: process.env.IDENTITY_DATABASE_URL, max: 2 });
if (!values.simulation && !process.env.IDENTITY_DATABASE_URL) {
  console.error('IDENTITY_DATABASE_URL manquant (compte identity_svc)');
  process.exit(2);
}
const comptes = new Map<string, string | null>();
async function compteDe(uid: string): Promise<string | null> {
  if (!identite) return null;
  if (!comptes.has(uid)) {
    const r = await identite.query<{ id: string }>(
      "select id from identity.legacy_ids where kind = 'firebase_uid' and legacy_id = $1",
      [uid],
    );
    comptes.set(uid, r.rows[0]?.id ?? null);
  }
  return comptes.get(uid)!;
}

// En simulation, la base n'est lue que pour calculer la reprise des personnages déjà importés
const base =
  values.simulation && !process.env.DATABASE_URL ? null : createDb(process.env.DATABASE_URL!);
const rapport = createWriteStream(values.rapport, { mode: 0o600 });
const correlationId = uuidv7();
const envoyer = envoyeurImages();
const bilan = { importes: 0, dejaImportes: 0, sansCompte: 0, erreurs: 0, avertissements: 0 };
const parSysteme: Record<string, number> = {};
/** Objets de l'inventaire legacy : repris (catalogue, personnalisés, crédités) ou perdus. */
const objetsLegacy = { catalogue: 0, personnalises: 0, credites: 0, perdus: 0 };
const perdus: Record<string, number> = {};
/** Reprise des personnages déjà importés. */
const reprise = {
  personnages: 0,
  modifies: 0,
  ajoutes: 0,
  dejaRepris: 0,
  dejaImportes: 0,
  bonusRattaches: 0,
  bourses: 0,
  valeursRetirees: 0,
  lignesRetirees: 0,
};
function compterReprise(b: BilanReprise, modifie: boolean) {
  reprise.personnages++;
  if (modifie) reprise.modifies++;
  reprise.ajoutes += b.ajoutes;
  reprise.dejaRepris += b.dejaRepris;
  reprise.dejaImportes += b.dejaImportes;
  reprise.bonusRattaches += b.bonusRattaches;
  if (b.bourse) reprise.bourses++;
  reprise.valeursRetirees += b.valeursRetirees.length;
  reprise.lignesRetirees += b.lignesRetirees;
}
async function dejaImporte(legacyId: string): Promise<string | undefined> {
  if (!base) return undefined;
  const [l] = await base.db
    .select({ id: legacyIds.characterId })
    .from(legacyIds)
    .where(and(eq(legacyIds.source, SOURCE_LEGACY), eq(legacyIds.legacyId, legacyId)));
  return l?.id;
}

for (const a of aImporter) {
  const ligne: Record<string, unknown> = {
    legacyId: a.legacyId,
    proprietaire: a.origineProprietaire,
  };
  try {
    const detection = detecterSysteme(a.doc.data ?? {}, a.salle);
    const migre = transformerPersonnage(a.doc, {
      ...a.options,
      systemeId: detection.id,
      systemes,
    });
    if (!detection.certain) migre.avertissements.unshift(`Système deviné : ${detection.id}`);
    Object.assign(ligne, {
      nom: migre.nom,
      systeme: detection.id,
      avertissements: migre.avertissements,
    });
    bilan.avertissements += migre.avertissements.length;
    parSysteme[detection.id] = (parSysteme[detection.id] ?? 0) + 1;
    for (const o of migre.objets) {
      if (o.credite) objetsLegacy.credites++;
      else if (o.possessions.some((p) => systemes[detection.id]?.entrees.get(p.entree)?.libre))
        objetsLegacy.personnalises++;
      else objetsLegacy.catalogue++;
    }
    for (const a of migre.avertissements) {
      const m =
        /^Objet « .* » (?:\(×\d+\) )?non migré : (.*)$/.exec(a) ?? /^Objet « .* » : (.*)$/.exec(a);
      if (!m) continue;
      objetsLegacy.perdus++;
      const raison = m[1]!.replace(/[^:]+ déjà possédé/, 'déjà possédé');
      perdus[raison] = (perdus[raison] ?? 0) + 1;
    }

    // Avatar embarqué dans la fiche : envoyé au stockage, remplacé par son adresse
    if (migre.avatarUrl?.startsWith('data:')) {
      if (values.simulation) {
        migre.avertissements.push('Avatar embarqué : sera envoyé au stockage à l’import');
      } else if (envoyer) {
        migre.avatarUrl = await envoyer(migre.avatarUrl);
      } else {
        migre.avatarUrl = null;
        migre.avertissements.push('Avatar embarqué non migré : stockage S3 non configuré');
      }
    }

    if (values.simulation) {
      ligne.statut = a.ownerUid ? 'simule' : 'sans-proprietaire';
      const existant = await dejaImporte(a.legacyId);
      if (existant) {
        const r = await reprendrePersonnage(
          base!.db,
          existant,
          systemes[detection.id]!,
          migre.objets,
          correlationId,
          false,
        );
        compterReprise(r.bilan, r.statut === 'repris');
        Object.assign(ligne, { statut: 'reprise-simulee', id: existant, reprise: r.bilan });
      }
    } else {
      const owner = a.ownerUid ? await compteDe(a.ownerUid) : null;
      if (!owner) {
        ligne.statut = 'sans-compte';
        bilan.sansCompte++;
      } else {
        // PNJ : un personnage non « joueurs » attribué au créateur de la salle faute de joueur
        const kind =
          a.origineProprietaire === 'createur-salle' && a.doc.data?.type !== 'joueurs'
            ? 'npc'
            : 'pc';
        const r = await chargerPersonnage(base!.db, migre, a.legacyId, owner, correlationId, kind);
        ligne.statut = r.statut;
        ligne.id = r.id;
        if (r.statut === 'importe') bilan.importes++;
        else {
          bilan.dejaImportes++;
          const rep = await reprendrePersonnage(
            base!.db,
            r.id,
            systemes[detection.id]!,
            migre.objets,
            correlationId,
            true,
          );
          compterReprise(rep.bilan, rep.statut === 'repris');
          ligne.reprise = rep.bilan;
        }
      }
    }
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

console.log(`Par système : ${JSON.stringify(parSysteme)}`);
console.log(
  `Objets legacy : ${objetsLegacy.catalogue} du catalogue, ${objetsLegacy.personnalises} ` +
    `personnalisés, ${objetsLegacy.credites} crédités, ${objetsLegacy.perdus} perdus` +
    (objetsLegacy.perdus ? ` (${JSON.stringify(perdus)})` : ''),
);
if (reprise.personnages)
  console.log(
    `Reprise${values.simulation ? ' (simulée)' : ''} de ${reprise.personnages} personnage(s) ` +
      `déjà importé(s), ${reprise.modifies} modifié(s) : ${reprise.ajoutes} objet(s) ajouté(s), ` +
      `${reprise.dejaImportes} déjà importé(s) par le premier import, ${reprise.dejaRepris} ` +
      `déjà repris, ${reprise.bonusRattaches} bonus rattaché(s) à leur objet, ` +
      `${reprise.bourses} bourse(s) convertie(s), ${reprise.valeursRetirees} valeur(s) et ` +
      `${reprise.lignesRetirees} ligne(s) de journal inconnues retirées.`,
  );
console.log(
  values.simulation
    ? `Simulation : rien n'a été écrit. ${bilan.avertissements} avertissement(s), ${bilan.erreurs} erreur(s).`
    : `Importés : ${bilan.importes}, déjà importés : ${bilan.dejaImportes}, ` +
        `sans compte migré : ${bilan.sansCompte}, erreurs : ${bilan.erreurs}.`,
);
console.log(`Rapport : ${values.rapport}`);
if (bilan.erreurs) process.exitCode = 1;
