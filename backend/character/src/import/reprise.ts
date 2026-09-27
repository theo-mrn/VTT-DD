/**
 * Reprise des personnages déjà importés, après l'arrivée des objets personnalisés.
 *
 * Le premier import écartait tout objet legacy absent du catalogue (potions,
 * nourriture, objets nommés librement…) et créditait les pièces D&D dans l'attribut
 * `bourse` (monnaie « pa »), retirés depuis des règles. La reprise ajoute à l'état
 * existant les objets que la migration actuelle sait reprendre, convertit la bourse en
 * pièces et retire les valeurs et lignes de journal que le système ne connaît plus.
 *
 * Idempotente : chaque objet legacy traité est tracé dans `legacy_items` (personnage,
 * chemin du document) ; un objet tracé n'est jamais repris deux fois.
 * La conversion de la bourse retire l'attribut : elle ne se refait pas.
 *
 * `reprendreEtat` est pure (testée seule) ; `reprendrePersonnage` l'applique en base,
 * dans une transaction, avec son événement `character.updated`.
 */
import { changesPayload } from '@vtt/contracts';
import {
  calculer,
  EtatEntite,
  nouvelExemplaire,
  quantiteDe,
  type BonusLibre,
  type Effet,
  type Possession,
  type SystemeCharge,
} from '@vtt/rules';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { appendEvent } from '../db/outbox.js';
import { characters, legacyItems } from '../db/schema.js';
import { etatNormalise, IDENTITES } from '../modules/personnages/depot.js';
import * as dnd from './correspondances/dnd-classic.js';
import type { ObjetRepris } from './transformer.js';

/**
 * Sortes que le premier import reprenait déjà (objets du catalogue) : un objet legacy qui
 * y tombe, sans trace, est considéré comme déjà importé (jamais recréé, même retiré
 * depuis par le joueur). Les objets personnalisés et les sortes nouvelles sont ajoutés.
 */
const SORTES_IMPORT_INITIAL: Readonly<Record<string, readonly string[]>> = {
  'dnd-classic': ['arme', 'armure'],
  'star-wars-eote': ['arme', 'armure', 'objet', 'accessoire', 'devise'],
};

/** Bourse retirée des règles : attribut compté dans une monnaie, converti en pièces. */
interface Bourse {
  attribut: string;
  monnaie: string;
  /** Valeur de chaque pièce en unités de la bourse ; conversion dans cet ordre. */
  pieces: readonly (readonly [entree: string, valeur: number])[];
}
const BOURSES: Readonly<Record<string, Bourse>> = { 'dnd-classic': dnd.BOURSE };

export interface BilanReprise {
  /** Objets ajoutés à l'état (catalogue ou personnalisés). */
  ajoutes: number;
  /** Déjà repris par une reprise précédente (tracés). */
  dejaRepris: number;
  /** Déjà migrés par le premier import (sorte reprise ou monnaie créditée), tracés. */
  dejaImportes: number;
  /** Bonus libres du premier import rattachés à leur objet repris. */
  bonusRattaches: number;
  /** Bourse convertie en pièces : unités converties, pièces ajoutées. */
  bourse?: { valeur: number; pieces: Record<string, number> };
  /** Valeurs d'attributs inconnus du système retirées (`bourse`…). */
  valeursRetirees: string[];
  /** Lignes du journal d'une monnaie retirée des règles (« pa ») retirées. */
  lignesRetirees: number;
  avertissements: string[];
}

/** JSON aux clés triées : deux effets égaux, quel que soit l'ordre de leurs champs. */
function canonique(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
}
const memeEffets = (a: readonly Effet[], b: readonly Effet[]) => canonique(a) === canonique(b);

/**
 * Nouvel état après reprise : objets legacy non tracés ajoutés, bourse convertie en
 * pièces, valeurs et lignes de journal inconnues retirées. `traces` : chemins legacy déjà
 * tracés ; `nouvellesTraces` : ceux à tracer après écriture.
 */
export function reprendreEtat(
  systeme: SystemeCharge,
  existant: EtatEntite,
  objets: readonly ObjetRepris[],
  traces: ReadonlySet<string>,
): { etat: EtatEntite; bilan: BilanReprise; nouvellesTraces: string[] } {
  const etat: EtatEntite = structuredClone(existant);
  const bilan: BilanReprise = {
    ajoutes: 0,
    dejaRepris: 0,
    dejaImportes: 0,
    bonusRattaches: 0,
    valeursRetirees: [],
    lignesRetirees: 0,
    avertissements: [],
  };
  const nouvellesTraces: string[] = [];
  const initiales = SORTES_IMPORT_INITIAL[systeme.source.id] ?? [];
  const sorteDe = (entree: string) => systeme.sortes.get(systeme.entrees.get(entree)?.sorte ?? '');
  const bourse = BOURSES[systeme.source.id];
  const valeurPiece = new Map(bourse?.pieces ?? []);
  let piecesLegacy = 0;

  const ajouter = (p: Possession) => {
    const sorte = sorteDe(p.entree);
    const siens = etat.possessions.filter((x) => x.entree === p.entree);
    const copie = structuredClone(p);
    delete copie.exemplaire;
    if (siens.length && sorte?.quantites && !sorte.exemplaires) {
      siens[0]!.quantite = quantiteDe(siens[0]!) + quantiteDe(p);
      return;
    }
    if (siens.length) copie.exemplaire = nouvelExemplaire(etat.possessions, p.entree);
    etat.possessions.push(copie);
  };

  for (const o of objets) {
    if (traces.has(o.legacyId)) {
      bilan.dejaRepris++;
      continue;
    }
    nouvellesTraces.push(o.legacyId);
    const dejaImporte =
      o.credite !== undefined ||
      (o.possessions.length > 0 &&
        o.possessions.every(
          (p) =>
            !systeme.entrees.get(p.entree)?.libre &&
            initiales.includes(sorteDe(p.entree)?.id ?? ''),
        ));
    if (dejaImporte) {
      bilan.dejaImportes++;
      continue;
    }
    const possessions = o.possessions.map((p) => structuredClone(p));
    // Bonus legacy de l'objet : devenu bonus libre au premier import, il revient à l'objet ;
    // retiré depuis par le joueur, il n'est pas recréé
    if (o.bonus && possessions[0]?.effets.length) {
      const effets = possessions[0].effets;
      const i = etat.bonus.findIndex(
        (b: BonusLibre) => b.nom === o.bonus && memeEffets(b.effets, effets),
      );
      if (i >= 0) {
        if (etat.bonus[i]!.actif) {
          etat.bonus.splice(i, 1);
          bilan.bonusRattaches++;
        } else possessions[0].effets = [];
      } else possessions[0].effets = [];
    }
    for (const p of possessions) {
      ajouter(p);
      piecesLegacy += (valeurPiece.get(p.entree) ?? 0) * quantiteDe(p);
    }
    bilan.ajoutes++;
  }

  // Bourse : le premier import y avait crédité les pièces legacy (arrondi à l'unité), que
  // la reprise vient d'ajouter en objets ; seul l'écart (gains et dépenses depuis) est converti
  const entite = systeme.entites.get(etat.type);
  if (bourse && !entite?.attributs.has(bourse.attribut)) {
    const brut = etat.valeurs[bourse.attribut];
    if (typeof brut === 'number') {
      const depense = etat.journal
        .filter((l) => l.monnaie === bourse.monnaie)
        .reduce((s, l) => s + l.cout, 0);
      let reste = Math.floor(brut - depense - Math.floor(piecesLegacy + 1e-9));
      if (reste < 0)
        bilan.avertissements.push(
          `Bourse : ${-reste} de moins que les pièces reprises, pièces laissées telles quelles`,
        );
      const ajoutees: Record<string, number> = {};
      for (const [entree, valeur] of bourse.pieces) {
        if (reste <= 0 || !systeme.entrees.has(entree)) continue;
        const n = Math.floor(reste / valeur);
        if (n <= 0) continue;
        reste -= n * valeur;
        ajoutees[entree] = n;
        ajouter({
          entree,
          rang: 0,
          actif: true,
          choix: {},
          champs: {},
          effets: [],
          ...(n > 1 ? { quantite: n } : {}),
        });
      }
      bilan.bourse = { valeur: brut - depense, pieces: ajoutees };
    }
  }

  // Valeurs d'attributs retirés des règles, lignes de journal d'une monnaie retirée :
  // ignorées par le calcul, elles sont nettoyées ici
  for (const cle of Object.keys(etat.valeurs))
    if (!entite?.attributs.has(cle)) {
      delete etat.valeurs[cle];
      bilan.valeursRetirees.push(cle);
    }
  // Une ligne d'un achat inconnu mais d'une monnaie connue reste (dépense d'XP reprise
  // de l'ancienne app, achat « migration ») : elle compte toujours dans le solde
  const avant = etat.journal.length;
  etat.journal = etat.journal.filter((l) => systeme.monnaies.has(l.monnaie));
  bilan.lignesRetirees = avant - etat.journal.length;

  etat.systeme = { id: systeme.source.id, version: systeme.source.version };
  return { etat: EtatEntite.parse(etat), bilan, nouvellesTraces };
}

/** Rien n'a changé dans l'état (seulement de nouvelles traces). */
export function etatInchange(a: EtatEntite, b: EtatEntite): boolean {
  return JSON.stringify(EtatEntite.parse(a)) === JSON.stringify(EtatEntite.parse(b));
}

export type ResultatReprise =
  { statut: 'repris'; bilan: BilanReprise } | { statut: 'inchange'; bilan: BilanReprise };

/**
 * Reprise d'un personnage déjà importé : état verrouillé, reprise, écriture (version
 * incrémentée, événement `character.updated`) et traces, dans une transaction. En
 * simulation (`ecrire` faux), le bilan seul, sans rien écrire.
 */
export async function reprendrePersonnage(
  db: Db,
  id: string,
  systeme: SystemeCharge,
  objets: readonly ObjetRepris[],
  correlationId: string,
  ecrire: boolean,
): Promise<ResultatReprise> {
  return db.transaction(async (tx) => {
    const requete = tx
      .select()
      .from(characters)
      .where(and(eq(characters.id, id), isNull(characters.deletedAt)));
    const [ligne] = ecrire ? await requete.for('update') : await requete;
    if (!ligne) throw new Error(`Personnage importé introuvable : ${id}`);
    const traces = new Set(
      (
        await tx
          .select({ legacyId: legacyItems.legacyId })
          .from(legacyItems)
          .where(eq(legacyItems.characterId, id))
      ).map((r) => r.legacyId),
    );
    const existant = EtatEntite.parse(ligne.etat);
    const { etat, bilan, nouvellesTraces } = reprendreEtat(systeme, existant, objets, traces);
    // L'état repris doit se calculer : une entrée inconnue ferait échouer toute la reprise
    const fiche = calculer(systeme, etat);
    for (const e of fiche.erreurs)
      if (e.message.startsWith('Entrée inconnue')) throw new Error(`${e.ou} : ${e.message}`);
    const inchange = etatInchange(existant, etat);
    if (!ecrire) return { statut: inchange ? 'inchange' : 'repris', bilan };

    if (!inchange) {
      const version = ligne.version + 1;
      await tx
        .update(characters)
        .set({ etat, systemVersion: etat.systeme.version, version, updatedAt: new Date() })
        .where(and(eq(characters.id, id), eq(characters.version, ligne.version)));
      await appendEvent(
        tx,
        { correlationId },
        {
          type: 'character.updated',
          actor: { userId: null, role: 'system', characterId: null },
          aggregate: { type: 'character', id },
          payload: {
            version,
            operation: 'reprise_import',
            importe: true,
            ...changesPayload(
              { etat: etatNormalise(existant) },
              { etat: etatNormalise(etat) },
              IDENTITES,
            ),
          },
        },
      );
    }
    if (nouvellesTraces.length)
      await tx
        .insert(legacyItems)
        .values(nouvellesTraces.map((legacyId) => ({ characterId: id, legacyId })))
        .onConflictDoNothing();
    return { statut: inchange ? 'inchange' : 'repris', bilan };
  });
}
