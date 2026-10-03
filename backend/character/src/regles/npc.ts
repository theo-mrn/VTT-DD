/**
 * Instances de PNJ posées sur la carte (docs/carte.md § 10 et § 12) : état complet d'un
 * PNJ tiré d'une créature du bestiaire de référence ou d'une création rapide, noms
 * numérotés (« Gobelin », « Gobelin 2 »…), objets reçus d'un coffre de la carte. Fonctions
 * pures : aucune clé de jeu n'est connue ici, tout est lu dans le système.
 */
import {
  calculer,
  EtatEntite,
  nouvellePossession,
  verifierChampsExemplaire,
  type BestiaryCreature,
  type Effet,
  type Entree,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import {
  ajouterObjetRecu,
  etatInitial,
  modifierValeurs,
  refus,
  verifierEtat,
} from './operations.js';

/**
 * Valeurs dérivées imprimées (livre, modèle legacy : Défense, Contact, seuils…) que le
 * système recalcule autrement : l'écart devient un bonus libre « Valeurs du modèle », pour
 * que la fiche affiche les mêmes valeurs. Générique : parcourt les attributs dérivés du
 * système. Renvoie aussi les attributs ainsi retrouvés.
 */
export function keepDerivedValues(
  systeme: SystemeCharge,
  etat: EtatEntite,
  valueOf: (cle: string) => number | undefined,
  warn: (w: string) => void = () => {},
): { etat: EtatEntite; kept: string[] } {
  const attributs = systeme.entites.get(etat.type)?.attributs;
  if (!attributs) return { etat, kept: [] };
  const fiche = calculer(systeme, etat);
  const targets = new Map<string, number>();
  const effets: Effet[] = [];
  for (const [cle, a] of attributs) {
    if (a.nature !== 'derivee') continue;
    const target = valueOf(cle);
    const computed = fiche.valeur(cle);
    if (target === undefined || typeof computed !== 'number' || computed === target) continue;
    targets.set(cle, target);
    effets.push({
      sur: 'attribut',
      attribut: cle,
      operation: 'ajouter',
      valeur: String(target - computed),
      description: `${a.nom} du modèle : ${target}`,
    });
  }
  if (!effets.length) return { etat, kept: [] };

  const next = EtatEntite.parse({
    ...etat,
    bonus: [
      ...etat.bonus,
      { id: 'valeurs-du-modele', nom: 'Valeurs du modèle', source: 'MJ', effets, actif: true },
    ],
  });
  const after = calculer(systeme, next);
  const kept: string[] = [];
  for (const [cle, target] of targets) {
    const v = after.valeur(cle);
    if (v === target) kept.push(cle);
    else
      warn(`${attributs.get(cle)!.nom} : ${target} dans le modèle, ${String(v)} après migration`);
  }
  return { etat: next, kept };
}

/**
 * État complet d'un PNJ tiré d'une créature du bestiaire (fiche de lecture) : les valeurs
 * saisissables sont posées telles quelles, les valeurs dérivées imprimées gardées par un
 * bonus « Valeurs du modèle », la création est terminée.
 */
export function bestiaryState(systeme: SystemeCharge, creature: BestiaryCreature): EtatEntite {
  const base = etatInitial(systeme, creature.entite);
  const attributs = systeme.entites.get(creature.entite)!.attributs;
  const valeurs: Record<string, Valeur> = {};
  for (const [cle, v] of Object.entries(creature.valeurs)) {
    const a = attributs.get(cle);
    if (a && a.nature !== 'derivee') valeurs[cle] = v;
  }
  const saisi = EtatEntite.parse({
    ...base,
    valeurs: { ...base.valeurs, ...valeurs },
    creation: false,
  });
  const printed = (cle: string) => {
    const v = creature.valeurs[cle];
    return typeof v === 'number' ? v : undefined;
  };
  return verifierEtat(systeme, keepDerivedValues(systeme, saisi, printed).etat).etat;
}

/**
 * Création rapide : état vide du type d'entité, valeurs saisies avec les droits du MJ
 * (attributs de base compris, pendant la création), puis création terminée.
 */
export function quickState(
  systeme: SystemeCharge,
  type: string,
  valeurs: Record<string, Valeur> = {},
): EtatEntite {
  const base = etatInitial(systeme, type);
  const saisi = Object.keys(valeurs).length
    ? modifierValeurs(systeme, base, valeurs, { proprietaire: true, mj: true })
    : base;
  return verifierEtat(systeme, { ...saisi, creation: false }).etat;
}

/** Nom sans son numéro d'instance (« Gobelin 3 » → « Gobelin »). */
export const baseName = (name: string) => name.replace(/ \d+$/, '').trim() || name;

/**
 * Noms de `count` nouvelles instances de `base` dans une campagne dont les PNJ portent
 * déjà `existing` : la numérotation reprend après le plus grand (« Gobelin » compte pour 1).
 */
export function npcNames(base: string, existing: string[], count: number): string[] {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const re = new RegExp(String.raw`^${escaped}(?: (\d+))?$`);
  let max = 0;
  for (const n of existing) {
    const m = re.exec(n);
    if (m) max = Math.max(max, m[1] ? Number(m[1]) : 1);
  }
  return Array.from({ length: count }, (_, i) => {
    const k = max + i + 1;
    if (k === 1) return base.slice(0, 100);
    const suffix = ` ${k}`;
    return `${base.slice(0, 100 - suffix.length)}${suffix}`;
  });
}

/** Objet pris dans un coffre de la carte : entrée du catalogue (`ref`) ou objet libre. */
export interface LootItem {
  ref?: string;
  name: string;
  description?: string;
  quantity: number;
}

/** Entrée « objet libre » possédable par ce type d'entité (à quantités de préférence). */
function freeEntry(systeme: SystemeCharge, type: string): Entree | undefined {
  const candidates = [...systeme.entrees.values()].filter((e) => {
    const sorte = systeme.sortes.get(e.sorte);
    return e.libre && sorte?.pour.includes(type) && sorte.nomExemplaire;
  });
  return candidates.find((e) => systeme.sortes.get(e.sorte)!.quantites) ?? candidates[0];
}

/**
 * Ajoute à l'inventaire un objet pris sur la carte, comme un don : unités ajoutées à un
 * exemplaire identique, sinon un nouvel exemplaire ; une sorte sans quantités reçoit un
 * exemplaire par unité. Sans `ref`, l'entrée libre du système porte le nom et la
 * description de l'objet (champs `nomExemplaire` et `descriptionExemplaire` de sa sorte).
 */
export function receiveLoot(
  systeme: SystemeCharge,
  etat: EtatEntite,
  item: LootItem,
): { etat: EtatEntite; entree: string; exemplaire?: string } {
  const entry = item.ref ? systeme.entrees.get(item.ref) : freeEntry(systeme, etat.type);
  if (!entry)
    throw item.ref
      ? refus(`Entrée inconnue du système : ${item.ref}`, 'entree_inconnue')
      : refus('Le système n’a pas d’objet libre pour ce personnage', 'objet_libre_indisponible');
  const sorte = systeme.sortes.get(entry.sorte)!;
  let champs: Record<string, string | number | boolean> = {};
  if (!item.ref) {
    champs[sorte.nomExemplaire!] = item.name;
    if (sorte.descriptionExemplaire && item.description)
      champs[sorte.descriptionExemplaire] = item.description;
    const v = verifierChampsExemplaire(systeme, entry, champs, etat.type);
    if (v.erreurs.length) throw refus(v.erreurs.join(' ; '), 'champs_invalides');
    champs = v.champs;
  }
  const objet = nouvellePossession(entry.id, 0, { champs });
  if (sorte.quantites) {
    const r = ajouterObjetRecu(systeme, etat, objet, item.quantity, 'Le personnage');
    return { ...r, entree: entry.id };
  }
  let current = etat;
  let exemplaire: string | undefined;
  for (let i = 0; i < item.quantity; i++) {
    const r = ajouterObjetRecu(systeme, current, objet, 1, 'Le personnage');
    current = r.etat;
    exemplaire = r.exemplaire;
  }
  return { etat: current, entree: entry.id, ...(exemplaire !== undefined ? { exemplaire } : {}) };
}
