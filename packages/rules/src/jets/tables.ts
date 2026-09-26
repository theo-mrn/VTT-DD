/**
 * Tirage sur une table aléatoire par intervalles (blessures critiques,
 * rencontres…). La formule de tirage reçoit la variable `modificateur`.
 */
import type { SystemeCharge } from '../chargement/index.js';
import { chemins } from '../chargement/index.js';
import { ErreurEvaluation, evaluer, type Generateur, type JetDes } from '../formules/index.js';
import type { Table } from '../schema/index.js';
import type { ErreurJet } from './symboles.js';

export type LigneTable = Table['lignes'][number];

export interface TirageTable {
  table: string;
  modificateur: number;
  /** Valeur obtenue par la formule de la table. */
  valeur: number;
  /** Dés lancés par la formule. */
  jets: JetDes[];
  /**
   * Ligne retenue. Une valeur sous la première ligne ou au-dessus de la
   * dernière prend la ligne extrême ; une valeur dans un trou de la table
   * ne donne aucune ligne (`null`).
   */
  ligne: LigneTable | null;
  /** Vrai si la valeur sortait de la table et a été ramenée à une ligne extrême. */
  horsTable: boolean;
  erreurs: ErreurJet[];
}

export function tirerTable(
  systeme: SystemeCharge,
  id: string,
  modificateur: number,
  aleatoire: Generateur,
): TirageTable {
  const table = systeme.tables.get(id);
  if (!table) throw new Error(`Table inconnue : ${id}`);
  const f = systeme.formule(chemins.table(id));

  const erreurs: ErreurJet[] = [];
  let valeur = 0;
  let jets: JetDes[] = [];
  try {
    const r = evaluer(f.noeud, {
      attribut: (cle) => {
        throw new ErreurEvaluation(`Attribut illisible ici : ${cle}`, 0);
      },
      modificateur: (cle) => {
        throw new ErreurEvaluation(`Modificateur illisible ici : ${cle}`, 0);
      },
      variable: (nom) => {
        if (nom === 'modificateur') return modificateur;
        throw new ErreurEvaluation(`Variable inconnue : ${nom}`, 0);
      },
      aleatoire,
    });
    valeur = Number(r.valeur);
    jets = r.jets;
  } catch (e) {
    if (!(e instanceof ErreurEvaluation)) throw e;
    erreurs.push({ ou: chemins.table(id), message: `${e.message} (« ${f.texte} »)` });
  }

  const lignes = [...table.lignes].sort((a, b) => a.min - b.min);
  const premiere = lignes[0]!;
  const derniere = lignes[lignes.length - 1]!;
  let ligne = lignes.find((l) => valeur >= l.min && valeur <= l.max) ?? null;
  let horsTable = false;
  if (!ligne && valeur < premiere.min) {
    ligne = premiere;
    horsTable = true;
  } else if (!ligne && valeur > derniere.max) {
    ligne = derniere;
    horsTable = true;
  }

  return { table: id, modificateur, valeur, jets, ligne, horsTable, erreurs };
}
