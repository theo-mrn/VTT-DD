/**
 * Attributs proposés dans le lanceur de dés, en trois couches :
 *   1. les règles : seuls les attributs qui déclarent `jet` (et leur apport) ;
 *   2. la présentation : ordre et regroupement (`des.jets`), sinon ordre du système
 *      groupé par `groupe` ;
 *   3. la campagne : le MJ en retire (`retires`), il ne peut jamais en ajouter.
 *
 * Fonctions pures : aucune clé de jeu n'est connue ici.
 */
import {
  optionPermet,
  optionsResolues,
  type ReglagesOptions,
  type SystemeCharge,
} from '../chargement/index.js';
import type { Attribut, GroupeJets, JetAttribut, Presentation } from '../schema/index.js';
import type { Fiche } from './fiche.js';

export type GenreApport = 'modificateur' | 'valeur' | 'formule';

export interface GroupeJetable {
  /** `jets/<i>` : groupe de la présentation ; sinon identifiant du `groupe` de l'attribut. */
  id: string | null;
  /** Titre du groupe ; `null` pour les attributs sans groupe. */
  titre: string | null;
}

/** Attribut jetable tel que le déclare le système (sans personnage). */
export interface DeclarationJetable {
  cle: string;
  nom: string;
  abrege?: string;
  description?: string;
  genre: GenreApport;
  /** Terme à ajouter à une formule de jet : `mod(@CLE)`, `@CLE` ou `(formule)`. */
  terme: string;
  groupe: GroupeJetable;
  /** Réservé au MJ (`visibilite: mj`). */
  mj: boolean;
}

/** Attribut jetable d'une fiche calculée, avec son apport. */
export interface AttributJetable extends DeclarationJetable {
  /** Valeur de l'apport sur la fiche (modificateur, valeur ou formule évaluée). */
  apport: number;
}

export interface OptionsJetables {
  /** Présentation du système : ses groupes `des.jets` donnent l'ordre et les titres. */
  presentation?: Pick<Presentation, 'des'> | null;
  /** Clés retirées par le réglage de la campagne. */
  retires?: Iterable<string>;
  /** Garder les attributs réservés au MJ (sinon écartés). */
  mj?: boolean;
  /**
   * Règles optionnelles (résolues) : un attribut d'une option éteinte n'est pas proposé.
   * Absentes : celles du système (`optionsCampagne`, sinon les défauts).
   */
  options?: ReglagesOptions;
}

const jetDe = (a: Attribut): JetAttribut | undefined => ('jet' in a && a.jet ? a.jet : undefined);

function genreEtTerme(cle: string, jet: JetAttribut): { genre: GenreApport; terme: string } {
  if (jet.apport === 'modificateur') return { genre: 'modificateur', terme: `mod(@${cle})` };
  if (jet.apport === 'valeur') return { genre: 'valeur', terme: `@${cle}` };
  return { genre: 'formule', terme: `(${jet.apport})` };
}

/**
 * Attributs jetables d'un type d'entité, dans l'ordre et les groupes du lanceur, sans
 * ceux retirés par la campagne. Liste vide pour un type inconnu.
 */
export function declarationsJetables(
  systeme: SystemeCharge,
  entite: string,
  o: OptionsJetables = {},
): DeclarationJetable[] {
  const e = systeme.entites.get(entite);
  if (!e) return [];
  const retires = new Set(o.retires ?? []);
  const options = o.options ?? optionsResolues(systeme);
  const nomsGroupes = new Map(e.type.groupes.map((g) => [g.id, g.nom]));

  const candidats = new Map<string, Attribut>();
  for (const a of e.attributs.values()) {
    if (!jetDe(a) || retires.has(a.cle) || !optionPermet(a, options)) continue;
    if (a.visibilite === 'mj' && !o.mj) continue;
    candidats.set(a.cle, a);
  }

  const liste: DeclarationJetable[] = [];
  const ajouter = (a: Attribut, groupe: GroupeJetable) => {
    candidats.delete(a.cle);
    liste.push({
      cle: a.cle,
      nom: a.nom,
      ...(a.abrege !== undefined ? { abrege: a.abrege } : {}),
      ...(a.description !== undefined ? { description: a.description } : {}),
      ...genreEtTerme(a.cle, jetDe(a)!),
      groupe,
      mj: a.visibilite === 'mj',
    });
  };

  // Groupes de la présentation qui concernent ce type d'entité, dans leur ordre
  const groupes: GroupeJets[] = o.presentation?.des?.jets ?? [];
  groupes.forEach((g, i) => {
    if (g.entite !== undefined && g.entite !== entite) return;
    for (const cle of g.attributs) {
      const a = candidats.get(cle);
      if (a) ajouter(a, { id: `jets/${i}`, titre: g.titre });
    }
  });

  // Le reste : ordre du système, groupé par `groupe` (dans l'ordre d'apparition)
  const parGroupe = new Map<string | null, Attribut[]>();
  for (const a of candidats.values()) {
    const g = a.groupe ?? null;
    parGroupe.set(g, [...(parGroupe.get(g) ?? []), a]);
  }
  for (const [g, attrs] of parGroupe) {
    const groupe = { id: g, titre: g === null ? null : (nomsGroupes.get(g) ?? g) };
    for (const a of attrs) ajouter(a, groupe);
  }
  return liste;
}

/** Attributs jetables d'une fiche calculée, avec leur apport (voir `declarationsJetables`). */
export function attributsJetables(fiche: Fiche, o: OptionsJetables = {}): AttributJetable[] {
  return declarationsJetables(fiche.systeme, fiche.entite.type.id, {
    ...o,
    options: fiche.options,
  }).map((d) => ({
    ...d,
    apport: fiche.valeurs.get(d.cle)?.jet ?? 0,
  }));
}

/** Regroupe une liste ordonnée d'attributs jetables par groupes consécutifs. */
export function grouperJetables<T extends { groupe: GroupeJetable }>(
  liste: readonly T[],
): { groupe: GroupeJetable; attributs: T[] }[] {
  const sortie: { groupe: GroupeJetable; attributs: T[] }[] = [];
  for (const x of liste) {
    const dernier = sortie.at(-1);
    if (dernier?.groupe.id === x.groupe.id) dernier.attributs.push(x);
    else sortie.push({ groupe: x.groupe, attributs: [x] });
  }
  return sortie;
}
