/**
 * Modifications d'état proposées par une action (dégâts, soins, dépense de
 * ressource…). Une action ne modifie jamais l'état elle-même : elle renvoie
 * ces modifications, que l'appelant applique (ou non) avec
 * `appliquerModifications`.
 */
import type { Fiche } from '../calcul/index.js';
import type { SystemeCharge } from '../chargement/index.js';
import type { LigneResistance } from './degats.js';
import {
  estExemplaire,
  nouvellePossession,
  nouvelExemplaire,
  quantiteDe,
  type EtatEntite,
} from '../schema/index.js';

export interface ModificationAttribut {
  /** Entité touchée : l'acteur ou la cible de l'action. */
  entite: 'acteur' | 'cible';
  /** Attribut de base ou ressource. */
  attribut: string;
  operation: 'ajouter' | 'retirer' | 'fixer';
  /** Valeur appliquée (après résistances pour des dégâts typés). */
  valeur: number;
  /** Type de dégâts, et dégâts avant résistances. */
  type?: string;
  brut?: number;
  /** Résistances, immunités et vulnérabilités de l'entité touchée, appliquées aux dégâts. */
  resistances?: LigneResistance[];
}

/**
 * Entrée donnée ou retirée (état, blessure…), avec une durée éventuelle en rounds.
 * `rangs` : rangs d'une entrée à rangs, unités d'une sorte à quantités ;
 * ignoré sinon (un exemplaire à la fois).
 */
export interface ModificationEntree {
  entite: 'acteur' | 'cible';
  entree: string;
  operation: 'donner' | 'retirer';
  rangs: number;
  duree?: number;
  /** Exemplaire visé (sorte `exemplaires`) ; absent : le dernier (retrait) ou un nouveau (don). */
  exemplaire?: string;
}

export type Modification = ModificationAttribut | ModificationEntree;

/**
 * Applique des modifications à l'état d'une fiche et renvoie un nouvel état
 * (l'état d'origine n'est pas touché). Seules les valeurs stockées changent :
 * les bornes (minimum, maximum d'une ressource) sont appliquées ensuite par
 * `calculer`.
 *
 * Point de départ quand aucune valeur n'est stockée : la valeur courante
 * calculée pour une ressource (sa valeur initiale), la valeur de base (défaut
 * borné, sans les effets) pour un attribut de base.
 *
 * `entite` restreint l'application aux modifications de cette entité ; sans
 * lui, toutes les modifications données sont appliquées.
 */
export function appliquerModifications(
  fiche: Fiche,
  modifications: Modification[],
  entite?: Modification['entite'],
): EtatEntite {
  const valeurs = { ...fiche.etat.valeurs };
  let possessions = fiche.etat.possessions;

  for (const m of modifications) {
    if (entite !== undefined && m.entite !== entite) continue;
    if ('entree' in m) {
      possessions = modifierPossession(fiche.systeme, possessions, m);
      continue;
    }
    const a = fiche.entite.attributs.get(m.attribut);
    if (!a || (a.nature !== 'base' && a.nature !== 'ressource')) {
      throw new Error(
        `Attribut de base ou ressource attendu sur ${fiche.entite.type.nom} : ${m.attribut}`,
      );
    }
    const stocke = valeurs[m.attribut];
    const depart =
      typeof stocke === 'number'
        ? stocke
        : a.nature === 'ressource'
          ? Number(fiche.valeur(m.attribut))
          : Number(
              fiche.valeurs.get(m.attribut)?.detail.find((l) => l.source === 'base')?.valeur ??
                a.defaut,
            );
    valeurs[m.attribut] =
      m.operation === 'fixer'
        ? m.valeur
        : m.operation === 'ajouter'
          ? depart + m.valeur
          : depart - m.valeur;
  }

  return { ...fiche.etat, valeurs, possessions };
}

function modifierPossession(
  systeme: SystemeCharge,
  possessions: EtatEntite['possessions'],
  m: ModificationEntree,
): EtatEntite['possessions'] {
  const o = { rangs: m.rangs, ...(m.duree !== undefined ? { duree: m.duree } : {}) };
  const x = m.exemplaire !== undefined ? { exemplaire: m.exemplaire } : {};
  return m.operation === 'donner'
    ? donnerEntree(systeme, possessions, m.entree, { ...o, ...x })
    : retirerEntree(systeme, possessions, m.entree, { rangs: m.rangs, ...x });
}

/**
 * Donne une entrée et renvoie la nouvelle liste de possessions (l'ancienne
 * n'est pas touchée). Entrée non possédée : nouvelle possession. Déjà possédée :
 * - à rangs : `rangs` rangs de plus (une seule possession par entrée) ;
 * - sorte `quantites` : `rangs` unités de plus sur le dernier exemplaire (ou celui visé) ;
 * - sorte `exemplaires` : un nouvel exemplaire (identifiant `exemplaire`, ou généré) ;
 * - sinon : la possession est réactivée et sa durée prolongée.
 */
export function donnerEntree(
  systeme: SystemeCharge,
  possessions: EtatEntite['possessions'],
  id: string,
  o: { rangs?: number; duree?: number; exemplaire?: string } = {},
): EtatEntite['possessions'] {
  const entree = systeme.entrees.get(id);
  if (!entree) throw new Error(`Entrée inconnue : ${id}`);
  const sorte = systeme.sortes.get(entree.sorte);
  const aRangs = !!sorte?.rangs;
  const n = Math.max(0, Math.floor(o.rangs ?? 1));
  const unites = Math.max(1, n);
  const liste = possessions.map((p) => ({ ...p }));
  const siens = liste.filter((p) => p.entree === id);
  const visee =
    o.exemplaire !== undefined
      ? siens.find((p) => estExemplaire(p, id, o.exemplaire))
      : siens[siens.length - 1];
  const extra = o.duree !== undefined ? { duree: o.duree } : {};

  const creer = (exemplaire: string | undefined) =>
    liste.push(
      nouvellePossession(id, aRangs ? n : 0, {
        ...extra,
        ...(exemplaire !== undefined ? { exemplaire } : {}),
        ...(sorte?.quantites && unites > 1 ? { quantite: unites } : {}),
      }),
    );

  if (!siens.length) {
    creer(o.exemplaire);
    return liste;
  }
  if (!aRangs && sorte?.quantites && visee) {
    visee.quantite = quantiteDe(visee) + unites;
    return liste;
  }
  // Exemplaire visé absent : il est créé ; aucun visé : un nouveau, identifiant généré
  if (!aRangs && sorte?.exemplaires && (!visee || o.exemplaire === undefined)) {
    creer(visee ? nouvelExemplaire(liste, id) : o.exemplaire);
    return liste;
  }
  const cible = aRangs ? siens[0]! : (visee ?? siens[0]!);
  if (aRangs) cible.rang += n;
  cible.actif = true;
  if (o.duree !== undefined) cible.duree = Math.max(cible.duree ?? 0, o.duree);
  return liste;
}

/**
 * Retire une entrée : des rangs (la possession disparaît à 0), des unités
 * d'une sorte `quantites` (l'exemplaire disparaît à 0), sinon un exemplaire
 * (celui visé, ou le dernier). Renvoie la nouvelle liste de possessions.
 */
export function retirerEntree(
  systeme: SystemeCharge,
  possessions: EtatEntite['possessions'],
  id: string,
  o: { rangs?: number; exemplaire?: string } = {},
): EtatEntite['possessions'] {
  const entree = systeme.entrees.get(id);
  if (!entree) throw new Error(`Entrée inconnue : ${id}`);
  const sorte = systeme.sortes.get(entree.sorte);
  const n = Math.max(0, Math.floor(o.rangs ?? 1));
  const liste = possessions.map((p) => ({ ...p }));
  const siens = liste.filter((p) => p.entree === id);
  const visee =
    o.exemplaire !== undefined
      ? siens.find((p) => estExemplaire(p, id, o.exemplaire))
      : siens[siens.length - 1];
  if (!visee) return liste;
  if (sorte?.rangs && visee.rang > n) {
    visee.rang -= n;
    return liste;
  }
  if (sorte?.quantites && quantiteDe(visee) > Math.max(1, n)) {
    visee.quantite = quantiteDe(visee) - Math.max(1, n);
    return liste;
  }
  return liste.filter((p) => p !== visee);
}

/**
 * Applique le résultat d'une table à un état : l'entrée de la ligne (blessure
 * critique, état…) est donnée comme par une conséquence (`donnerEntree`) :
 * un rang de plus pour une entrée à rangs déjà possédée, une unité ou un
 * nouvel exemplaire si la sorte l'autorise. Renvoie un nouvel état ; sans
 * entrée, l'état est rendu tel quel.
 */
export function appliquerTirage(
  systeme: SystemeCharge,
  etat: EtatEntite,
  tirage: { ligne: { entree?: string | undefined } | null },
): EtatEntite {
  const id = tirage.ligne?.entree;
  if (!id || !systeme.entrees.has(id)) return etat;
  return { ...etat, possessions: donnerEntree(systeme, etat.possessions, id, { rangs: 1 }) };
}
