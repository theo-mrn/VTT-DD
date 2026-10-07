/**
 * État d'une entité (personnage, PNJ, véhicule…) : uniquement ce que le joueur
 * a saisi, acheté ou tiré. Tout le reste est recalculé par le moteur.
 */
import { z } from 'zod';
import { Cle, Effet, Id, MomentDecompte, type Entree, type Sorte } from './systeme.js';

/**
 * Comment une durée posée se décompte (docs/combat.md § 18.1). Absent : à chaque fin de round.
 */
export const Decompte = z.object({
  moment: MomentDecompte,
  /** Personnage dont le tour compte (`debut-tour`, `fin-tour`) ; absent : le porteur. */
  de: z.string().trim().min(1).max(100).optional(),
  /**
   * `fin-tour` : le prochain événement du tour de `de` lève l'attente sans décompter (« jusqu'à
   * la fin de son **prochain** tour »). Posée par le serveur, jamais par le client.
   */
  attente: z.boolean().optional(),
});
export type Decompte = z.output<typeof Decompte>;

/**
 * Possession d'une entrée par l'entité. Une entrée d'une sorte sans rangs
 * déclarée `exemplaires` peut être possédée plusieurs fois : chaque
 * possession est alors un exemplaire, distingué par `exemplaire` (unique par
 * entrée ; absent : l'exemplaire historique, unique). Une entrée à rangs n'a
 * qu'une possession, dont les rangs s'additionnent.
 */
export const Possession = z.object({
  entree: Id,
  /** Identifiant de l'exemplaire, unique par entrée ; absent : exemplaire unique historique. */
  exemplaire: Id.optional(),
  /**
   * Nombre d'unités de l'exemplaire (munitions, stimpacks) pour une sorte
   * `quantites` ; absent : 1. `somme` et `somme_actifs` multiplient le champ par la quantité.
   */
  quantite: z.number().int().positive().optional(),
  /** Rangs achetés (hors rangs gratuits donnés par des effets). */
  rang: z.number().int().nonnegative().default(0),
  /** Équipée / active (sortes `activable`). */
  actif: z.boolean().default(true),
  /** Entrées retenues pour chaque choix de l'entrée. */
  choix: z.record(z.string(), z.array(Id)).default({}),
  /**
   * Effets propres à cet exemplaire, en plus de ceux de l'entrée : épée +1,
   * objet enchanté, bonus saisi sur un objet. Actifs quand l'exemplaire l'est.
   */
  effets: z.array(Effet).default([]),
  /** Décomptes restants pour un état temporaire (rounds par défaut, voir `decompte`). */
  duree: z.number().int().nonnegative().optional(),
  /** Moment du décompte de `duree` ; absent : chaque fin de round. */
  decompte: Decompte.optional(),
  /**
   * Valeurs propres à cet exemplaire (points d'Obligation, munitions…). Un champ `formule`
   * y reçoit le texte d'une formule qui remplace celle de l'entrée (`formuleChamp`).
   */
  champs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
  /**
   * Exemplaire caché aux autres joueurs : seuls le propriétaire et le MJ le voient (le
   * service character le retire de la lecture des autres). Absent : visible.
   */
  hidden: z.boolean().optional(),
  /** Dossier d'inventaire de l'exemplaire (`folders` de l'état) ; absent : à la racine. */
  folder: Id.optional(),
});
export type Possession = z.output<typeof Possession>;

/** Nouvelle possession avec toutes ses valeurs par défaut. */
export function nouvellePossession(
  entree: string,
  rang = 0,
  extra: Partial<Possession> = {},
): Possession {
  return { entree, rang, actif: true, choix: {}, champs: {}, effets: [], ...extra };
}

/** Quantité d'une possession (1 si elle n'en déclare pas). */
export function quantiteDe(p: Pick<Possession, 'quantite'>): number {
  return p.quantite ?? 1;
}

/** Même entrée et même exemplaire (absent désigne l'exemplaire sans identifiant). */
export function estExemplaire(
  p: Pick<Possession, 'entree' | 'exemplaire'>,
  entree: string,
  exemplaire?: string,
): boolean {
  return p.entree === entree && p.exemplaire === exemplaire;
}

/**
 * Identifiant libre pour un nouvel exemplaire d'une entrée : `2`, `3`… (le
 * premier exemplaire, sans identifiant, compte pour 1).
 */
export function nouvelExemplaire(
  possessions: readonly Pick<Possession, 'entree' | 'exemplaire'>[],
  entree: string,
): string {
  const pris = new Set(possessions.filter((p) => p.entree === entree).map((p) => p.exemplaire));
  let n = 2;
  while (pris.has(String(n))) n++;
  return String(n);
}

/** Identifiant de source des effets propres d'un exemplaire : `entree#exemplaire` ou `entree#<id>`. */
export function sourceExemplaire(p: Pick<Possession, 'entree' | 'exemplaire'>): string {
  return `${p.entree}#${p.exemplaire ?? 'exemplaire'}`;
}

/** Valeur texte non vide d'un champ propre de l'exemplaire, désigné par la sorte. */
function champTexte(p: Pick<Possession, 'champs'> | undefined, champ: string | undefined) {
  const v = champ !== undefined ? p?.champs[champ] : undefined;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Nom affiché d'une possession : le nom propre de l'exemplaire (champ `nomExemplaire` de
 * la sorte : objet personnalisé, arme renommée), sinon celui de l'entrée.
 */
export function nomPossession(
  entree: Pick<Entree, 'nom'>,
  sorte: Pick<Sorte, 'nomExemplaire'>,
  p?: Pick<Possession, 'champs'>,
): string {
  return champTexte(p, sorte.nomExemplaire) ?? entree.nom;
}

/** Description affichée d'une possession : celle de l'exemplaire, sinon celle de l'entrée. */
export function descriptionPossession(
  entree: Pick<Entree, 'description'>,
  sorte: Pick<Sorte, 'descriptionExemplaire'>,
  p?: Pick<Possession, 'champs'>,
): string | undefined {
  return champTexte(p, sorte.descriptionExemplaire) ?? entree.description;
}

/**
 * Bonus libre posé sur l'entité (potion, bénédiction, décision du MJ) : mêmes
 * effets que le catalogue, sans entrée de catalogue derrière.
 */
export const BonusLibre = z.object({
  id: Id,
  nom: z.string().min(1).max(200),
  /** D'où vient le bonus, pour l'affichage (« Potion de force », « MJ »). */
  source: z.string().max(200).optional(),
  /**
   * Effets du bonus ; vide : état libre, un simple marqueur (nom, durée) sans effet mécanique,
   * posé par le MJ sur un participant du combat (docs/combat.md § 4.5).
   */
  effets: z.array(Effet).default([]),
  actif: z.boolean().default(true),
  /** Décomptes restants (rounds par défaut, voir `decompte`) ; absent : permanent. */
  duree: z.number().int().nonnegative().optional(),
  /** Moment du décompte de `duree` ; absent : chaque fin de round. */
  decompte: Decompte.optional(),
});
export type BonusLibre = z.output<typeof BonusLibre>;

/** Dossier d'inventaire d'une entité, pour ranger ses exemplaires (sacs, coffres…). */
export const InventoryFolder = z.object({
  id: Id,
  name: z.string().trim().min(1).max(60),
});
export type InventoryFolder = z.output<typeof InventoryFolder>;

/** Nombre maximal de dossiers d'inventaire par entité. */
export const MAX_INVENTORY_FOLDERS = 50;

/**
 * Clé stable d'un effet : `<source>/<index>`, où `<source>` est l'identifiant de source des
 * explications (`armure-cuir` pour les effets du catalogue d'une entrée, `dague#2` ou
 * `dague#exemplaire` pour les effets propres d'un exemplaire, `bonus:potion` pour un bonus
 * libre) et `<index>` la position de l'effet dans sa liste (`entree.effets`,
 * `possession.effets`, `bonus.effets`), à partir de 0.
 */
export const CleEffet = z
  .string()
  .max(420)
  .regex(
    /^(bonus:)?[\p{L}\p{N}_][\p{L}\p{N}_-]*(#[\p{L}\p{N}_][\p{L}\p{N}_-]*)?\/(0|[1-9]\d{0,3})$/u,
    'Clé d’effet attendue : <source>/<index>',
  );

/** Clé stable d'un effet : identifiant de sa source et position dans la liste. */
export function cleEffet(source: string, index: number): string {
  return `${source}/${index}`;
}

/** Source et position d'une clé d'effet (`undefined` si la clé est mal formée). */
export function lireCleEffet(cle: string): { source: string; index: number } | undefined {
  if (!CleEffet.safeParse(cle).success) return undefined;
  const i = cle.lastIndexOf('/');
  return { source: cle.slice(0, i), index: Number(cle.slice(i + 1)) };
}

/** Nombre maximal d'effets désactivés par entité. */
export const MAX_EFFETS_DESACTIVES = 1000;

export const LigneJournal = z.object({
  achat: Id,
  /** Attribut, entrée ou `arbre/noeud` obtenu. */
  objet: z.string(),
  cout: z.number(),
  monnaie: Cle,
  creation: z.boolean(),
  date: z.string().optional(),
});
export type LigneJournal = z.output<typeof LigneJournal>;

export const EtatEntite = z.object({
  type: Id,
  systeme: z.object({ id: Id, version: z.string() }),
  valeurs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
  possessions: z.array(Possession).default([]),
  /** Bonus libres posés sur l'entité. */
  bonus: z.array(BonusLibre).default([]),
  /** Nœuds acquis, par arbre. */
  noeuds: z.record(z.string(), z.array(Id)).default({}),
  journal: z.array(LigneJournal).default([]),
  /** Dossiers d'inventaire, dans leur ordre d'affichage. */
  folders: z.array(InventoryFolder).max(MAX_INVENTORY_FOLDERS).default([]),
  /**
   * Effets coupés un à un (`CleEffet`), sans toucher à leur source : l'objet reste équipé,
   * le talent possédé, mais cet effet-là ne s'applique pas. Effets du catalogue d'une entrée
   * et effets propres d'un exemplaire ; un bonus libre s'active, lui, par son `actif`.
   */
  effetsDesactives: z.array(CleEffet).max(MAX_EFFETS_DESACTIVES).default([]),
  /** Vrai tant que la création n'est pas terminée. */
  creation: z.boolean().default(false),
});
export type EtatEntite = z.output<typeof EtatEntite>;
export type EtatEntiteSaisi = z.input<typeof EtatEntite>;
