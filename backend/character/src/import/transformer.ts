/**
 * Migration d'un personnage de l'ancienne app vers `EtatEntite` (@vtt/rules).
 * Fonction pure : aucun accès à la base, les documents liés (inventaire,
 * bonus, spécialisations du contenu) sont passés en options.
 *
 * Principe : le personnage migré affiche les mêmes valeurs que l'ancienne
 * fiche. L'état ne garde que ce que le joueur a saisi ou acheté ; la part
 * apportée par les règles (bonus d'espèce ou de race, rangs gratuits, effets
 * des capacités) est retrouvée en calculant la fiche avec le moteur, puis
 * retranchée des valeurs legacy. Tout ce qui ne peut pas être migré, ou dont la
 * valeur change, devient un avertissement, jamais une exception.
 *
 * Seule exception : un système absent de `options.systemes` (erreur d'appel).
 */
import {
  calculer,
  chemins,
  detailSolde,
  EtatEntite,
  erreursChoix,
  estExemplaire,
  examinerAchat,
  nombreChoix,
  noeudsIsoles,
  nouvellePossession,
  nouvelExemplaire,
  quantiteDe,
  type Arbre,
  type BonusLibre,
  type Effet,
  type Entree,
  type Fiche,
  type LigneJournal,
  type Possession,
  type PossessionEffective,
  type SystemeCharge,
} from '@vtt/rules';
import * as dnd from './correspondances/dnd-classic.js';
import * as sw from './correspondances/star-wars-eote.js';
import {
  entier,
  nombre,
  originePersonnage,
  slug,
  texte,
  type BonusLegacy,
  type CompetencePersonnaliseeLegacy,
  type DocFirestore,
  type ObjetInventaireLegacy,
  type PersonnageLegacy,
  type SpecialisationLegacy,
} from './legacy.js';

export const SYSTEMES_MIGRES = ['dnd-classic', 'star-wars-eote', 'nooblies'] as const;
export type IdSystemeMigre = (typeof SYSTEMES_MIGRES)[number];

export interface OptionsTransformation {
  /**
   * Système cible. À défaut, il est déduit des champs du personnage (voir
   * `detecterSysteme`), avec un avertissement si le doute est permis.
   */
  systemeId?: string;
  /** Systèmes chargés (`charger()` de @vtt/rules), par id. */
  systemes: Readonly<Record<string, SystemeCharge>>;
  /** Objets de `Inventaire/{roomId}/{Nomperso}`. */
  inventaire?: readonly DocFirestore<ObjetInventaireLegacy>[];
  /** Bonus de `Bonus/{roomId}/{Nomperso}`. */
  bonus?: readonly DocFirestore<BonusLegacy>[];
  /** `cartes/{roomId}/characters/{id}/customCompetences`. */
  competencesPersonnalisees?: readonly DocFirestore<CompetencePersonnaliseeLegacy>[];
  /**
   * Documents `specialization` du contenu du système de la salle
   * (`gameSystems/{id}/content`), par id de document : les personnages Star
   * Wars ne référencent leurs spécialisations que par cet id.
   */
  specialisations?: Readonly<Record<string, SpecialisationLegacy>>;
  /**
   * Stats du système de la salle (`gameSystems/{id}.stats`) : `recoversToZero`
   * dit si une jauge compte ce qui est subi (Blessures, vrai) ou ce qui reste
   * (PV, faux). À défaut : compteurs pour Star Wars, PV restants sinon.
   */
  statsSalle?: readonly { key: string; recoversToZero?: boolean }[];
}

export interface PersonnageMigre {
  etat: EtatEntite;
  nom: string;
  avatarUrl: string | null;
  legacy: { id: string; roomId?: string; ownerUid?: string; type?: string };
  /** Textes et mesures sans place dans les règles (description, taille…), à garder à côté. */
  details: Record<string, string | number>;
  /** Objets de l'inventaire legacy repris (traces de la reprise idempotente). */
  objets: ObjetRepris[];
  avertissements: string[];
}

// ─── Détection du système ────────────────────────────────────────────────────

const CHAMPS_STAR_WARS = [
  'skillRanks',
  'career',
  'specializations',
  'unlockedTalents',
  'xpSpent',
  'Obligations',
  'vigueur',
  'agilite',
];

/**
 * Système d'un personnage legacy. `salle` : `gameSystemId` de `Salle/{roomId}`
 * et nom du système (`gameSystems/{id}.name`), plus sûrs que les champs.
 * `certain` est faux quand seuls les champs ont parlé et que D&D et Noobliés
 * (mêmes caractéristiques) restent possibles.
 */
export function detecterSysteme(
  p: PersonnageLegacy,
  salle: { gameSystemId?: string; nomSysteme?: string } = {},
): { id: IdSystemeMigre; certain: boolean } {
  if (salle.gameSystemId === 'dnd-classic') return { id: 'dnd-classic', certain: true };
  const nom = slug(salle.nomSysteme ?? '');
  if (/star-wars|confins-de-l-empire|edge-of-the-empire/.test(nom))
    return { id: 'star-wars-eote', certain: true };
  if (/noobli/.test(nom)) return { id: 'nooblies', certain: true };
  if (CHAMPS_STAR_WARS.some((c) => p[c] !== undefined))
    return { id: 'star-wars-eote', certain: true };
  if (Object.keys(p).some((c) => /^Voie\d+$/.test(c) && texte(p[c])))
    return { id: 'dnd-classic', certain: true };
  return { id: 'dnd-classic', certain: false };
}

// ─── Brouillon d'état ────────────────────────────────────────────────────────

type Valeur = number | string | boolean;

/** État en construction, recalculé à la demande avec le moteur. */
class Brouillon {
  valeurs: Record<string, Valeur> = {};
  possessions: Possession[] = [];
  noeuds: Record<string, string[]> = {};
  journal: LigneJournal[] = [];
  bonus: BonusLibre[] = [];
  /** Objets de l'inventaire legacy repris, par document. */
  objets: ObjetRepris[] = [];

  constructor(
    readonly systeme: SystemeCharge,
    readonly avertir: (message: string) => void,
  ) {}

  etat(): EtatEntite {
    return EtatEntite.parse({
      type: 'personnage',
      systeme: { id: this.systeme.source.id, version: this.systeme.source.version },
      valeurs: this.valeurs,
      possessions: this.possessions,
      noeuds: this.noeuds,
      journal: this.journal,
      bonus: this.bonus,
      creation: false,
    });
  }

  fiche(): Fiche {
    return calculer(this.systeme, this.etat());
  }

  /** Entrée du catalogue, si elle existe et est de la sorte attendue. */
  entree(id: string | undefined, sorte?: string): Entree | undefined {
    if (!id) return undefined;
    const e = this.systeme.entrees.get(id);
    return e && (!sorte || e.sorte === sorte) ? e : undefined;
  }

  possession(id: string): Possession | undefined {
    return this.possessions.find((p) => p.entree === id);
  }

  /** Ajoute une possession (ou renvoie celle qui existe déjà). */
  posseder(id: string, init: Partial<Omit<Possession, 'entree'>> = {}): Possession {
    const deja = this.possession(id);
    if (deja) return deja;
    const p = nouvellePossession(id, init.rang ?? 0, init);
    this.possessions.push(p);
    return p;
  }

  /**
   * Ajoute un exemplaire de plus d'une entrée : sans identifiant si elle
   * n'est pas encore possédée, sinon identifiant généré (`2`, `3`…) si sa
   * sorte admet des exemplaires. `undefined` si l'entrée ne se possède qu'une fois.
   */
  ajouterExemplaire(
    id: string,
    init: Partial<Omit<Possession, 'entree'>> = {},
  ): Possession | undefined {
    if (!this.possession(id)) return this.posseder(id, init);
    const entree = this.systeme.entrees.get(id);
    if (!entree || !this.systeme.sortes.get(entree.sorte)?.exemplaires) return undefined;
    const p = nouvellePossession(id, init.rang ?? 0, {
      ...init,
      exemplaire: nouvelExemplaire(this.possessions, id),
    });
    this.possessions.push(p);
    return p;
  }

  nom(id: string): string {
    return this.systeme.entrees.get(id)?.nom ?? id;
  }

  /**
   * Remplit un choix d'une possession avec des entrées legacy déjà traduites :
   * garde celles que le choix accepte, sans doublon, au plus `nombre`.
   */
  choisir(p: Possession, choixId: string, ids: string[], quoi: string): void {
    const entree = this.systeme.entrees.get(p.entree);
    const c = entree?.choix.find((x) => x.id === choixId);
    if (!entree || !c || !ids.length) return;
    const fiche = this.fiche();
    const retenus: string[] = [];
    for (const id of ids) {
      if (retenus.includes(id)) continue;
      const erreurs = erreursChoix(fiche, entree.id, c, [id]);
      if (erreurs.length) this.avertir(`${quoi} : ${erreurs.join(' ; ')}`);
      else retenus.push(id);
    }
    const max = nombreChoix(fiche, entree.id, c);
    if (retenus.length > max) {
      this.avertir(
        `${quoi} : ${retenus.length} choix pour ${max} permis, ${retenus
          .slice(max)
          .map((id) => this.nom(id))
          .join(', ')} ignoré(s)`,
      );
      retenus.length = max;
    }
    if (retenus.length) p.choix[choixId] = retenus;
  }

  /**
   * Attributs de base dont la valeur legacy est la valeur FINALE (bonus
   * d'espèce ou de race compris) : enregistre la part propre au personnage.
   */
  ajusterBases(cibles: Record<string, number>): void {
    const cles = Object.keys(cibles);
    if (!cles.length) return;
    for (const k of cles) this.valeurs[k] = cibles[k]!;
    const sonde = this.fiche();
    for (const k of cles) {
      const cible = cibles[k]!;
      let base = cible - (Number(sonde.valeur(k)) - cible);
      const min = sonde.valeurs.get(k)?.min;
      if (min !== undefined && base < min) base = min;
      this.valeurs[k] = base;
    }
    const f = this.fiche();
    for (const k of cles) {
      const obtenu = Number(f.valeur(k));
      if (obtenu !== cibles[k])
        this.avertir(
          `${nomAttribut(this.systeme, k)} : ${cibles[k]} dans l'ancienne fiche, ${obtenu} après migration`,
        );
    }
  }

  /**
   * Rangs legacy TOTAUX (gratuits compris) : n'enregistre que la part achetée,
   * les rangs gratuits (espèce, carrière, spécialisation) venant des règles.
   */
  ajusterRangs(cibles: Record<string, number>, sorte: string): void {
    const f = this.fiche();
    for (const [id, cible] of Object.entries(cibles)) {
      const gratuit = f.possessions.get(id)?.rang ?? 0;
      const achete = cible - gratuit;
      if (achete < 0)
        this.avertir(
          `${this.nom(id)} : rang ${cible} dans l'ancienne fiche, ${gratuit} accordé(s) d'office par le nouveau système`,
        );
      if (achete > 0) this.posseder(id).rang = achete;
    }
    const apres = this.fiche();
    for (const [id, cible] of Object.entries(cibles)) {
      const rang = apres.possessions.get(id)?.rang ?? 0;
      if (rang < cible)
        this.avertir(
          `${this.nom(id)} : rang ${cible} dans l'ancienne fiche, ${rang} après migration`,
        );
    }
    for (const p of apres.possessions.values())
      if (p.sorte.id === sorte && p.rang > 0 && cibles[p.entree.id] === undefined)
        this.avertir(
          `${p.entree.nom} : rang ${p.rang} accordé par le nouveau système (0 dans l'ancienne fiche)`,
        );
  }

  /**
   * Attribut de base `base` réglé pour que la dérivée `derivee` vaille `cible`
   * (jets de dés de vie → PV max). La dérivée doit être affine en `base`.
   */
  ajusterPar(base: string, derivee: string, cible: number): void {
    this.valeurs[base] = 0;
    const sonde = this.fiche();
    let v = cible - Number(sonde.valeur(derivee));
    const bornes = sonde.valeurs.get(base);
    if (bornes?.min !== undefined && v < bornes.min) v = bornes.min;
    if (bornes?.max !== undefined && v > bornes.max) v = bornes.max;
    this.valeurs[base] = v;
    const obtenu = Number(this.fiche().valeur(derivee));
    if (obtenu !== cible)
      this.avertir(
        `${nomAttribut(this.systeme, derivee)} : ${cible} dans l'ancienne fiche, ${obtenu} après migration`,
      );
  }

  /**
   * Rejoue au journal l'achat, rang par rang, des possessions déjà placées
   * (coûts calculés par le moteur, comme un achat en jeu).
   */
  rejouerRangs(achatId: string, rangs: [string, number][]): void {
    for (const [id] of rangs) this.posseder(id).rang = 0;
    for (const [id, rang] of rangs) {
      for (let r = 1; r <= rang; r++) {
        const ex = examinerAchat(this.fiche(), achatId, id);
        if (ex.ok)
          this.journal.push({
            achat: achatId,
            objet: id,
            cout: ex.objet.cout,
            monnaie: ex.objet.monnaie,
            creation: false,
          });
        else this.avertir(`${this.nom(id)} rang ${r} : ${ex.erreur}`);
        this.posseder(id).rang = r;
      }
    }
  }

  /** Valeur courante d'une ressource, bornée à ce que le système accepte. */
  ressource(cle: string, valeur: number): void {
    this.valeurs[cle] = valeur;
    const v = this.fiche().valeurs.get(cle);
    if (v && Number(v.valeur) !== valeur)
      this.avertir(
        `${nomAttribut(this.systeme, cle)} : ${valeur} dans l'ancienne fiche, ramené à ${v.valeur} (maximum ${v.max})`,
      );
  }
}

function nomAttribut(systeme: SystemeCharge, cle: string): string {
  for (const e of systeme.entites.values()) {
    const a = e.attributs.get(cle);
    if (a) return a.nom;
  }
  return cle;
}

/** Vrai si la jauge legacy compte ce qui est subi (0 = indemne). */
function compteSubi(options: OptionsTransformation, cle: string, defaut: boolean): boolean {
  const stat = options.statsSalle?.find((s) => s.key === cle);
  return stat ? !!stat.recoversToZero : defaut;
}

// ─── Inventaire et bonus ─────────────────────────────────────────────────────

interface RegleInventaire {
  /** Sortes d'entrées que peut devenir un objet. */
  sortes: string[];
  /** Noms legacy (slug) → entrée, avant la recherche par nom. */
  alias: Readonly<Record<string, string>>;
  /** Monnaie : attribut crédité, et valeur d'un objet en unités de cet attribut. */
  monnaie?: { attribut: string; valeur: (nom: string, entree?: Entree) => number | undefined };
  /**
   * Objet absent du catalogue : entrée `libre` qui le reçoit et valeurs de ses champs
   * propres (catégorie, dés d'une arme…), le nom étant ajouté d'office. À défaut, l'entrée
   * libre de la première sorte qui en a une.
   */
  libre?: (objet: ObjetInventaireLegacy) => { entree: string; champs?: Record<string, Valeur> };
}

/**
 * Objets migrés : id du document legacy → exemplaire possédé (celui qui
 * reçoit le bonus saisi sur l'objet), et si son entrée porte des effets.
 */
type ObjetsMigres = Map<string, ObjetMigre>;
interface ObjetMigre {
  entree: string;
  exemplaire?: string;
  avecEffets: boolean;
  repris: ObjetRepris;
}

/**
 * Ce qu'est devenu un objet de l'inventaire legacy : les exemplaires créés, ou la valeur
 * créditée à une monnaie. Sert à la reprise idempotente des personnages déjà importés.
 */
export interface ObjetRepris {
  /** Chemin du document legacy (`Inventaire/{salle}/{personnage}/{id}`). */
  legacyId: string;
  nom: string;
  /** Exemplaires créés (un par unité pour une sorte sans quantités), effets du bonus compris. */
  possessions: Possession[];
  /** Nom du bonus legacy rattaché à l'objet : ses effets sont ceux de `possessions[0]`. */
  bonus?: string;
  /** Crédité à un attribut (crédits) plutôt que possédé. */
  credite?: { attribut: string; valeur: number };
}

/** Entrée `libre` (objets hors catalogue) de la première des sortes qui en déclare une. */
function entreeLibre(systeme: SystemeCharge, sortes: readonly string[]): Entree | undefined {
  for (const s of sortes)
    for (const e of systeme.entrees.values()) if (e.sorte === s && e.libre) return e;
  return undefined;
}

/**
 * Objets d'inventaire → possessions ou monnaie. Chaque objet legacy devient
 * son propre exemplaire (sorte `exemplaires`), avec sa quantité (sorte
 * `quantites`) ; sans quantités, un objet ×3 donne trois exemplaires. Une
 * sorte à quantités sans exemplaires cumule les quantités sur sa seule
 * possession. Un objet absent du catalogue devient un exemplaire de l'entrée
 * `libre` du système, qui porte son nom et sa catégorie legacy. Renvoie
 * l'exemplaire de chaque objet migré, pour ses bonus.
 */
/** Catalogue d'équipement par slug du nom et par id (hors entrées libres). */
function catalogueParNom(b: Brouillon, regle: RegleInventaire | undefined): Map<string, Entree> {
  const parNom = new Map<string, Entree>();
  for (const e of b.systeme.entrees.values())
    if (regle?.sortes.includes(e.sorte) && !e.libre) {
      parNom.set(slug(e.nom), e);
      parNom.set(e.id, e);
    }
  return parNom;
}

/** Nom et quantité d'un objet legacy à migrer ; `undefined` pour un dossier, un objet sans nom ou épuisé. */
function objetLegacy(o: ObjetInventaireLegacy): { nom: string; quantite: number } | undefined {
  if (o.isFolder) return undefined;
  const nom = texte(o.message);
  if (!nom) return undefined;
  const quantite = entier(o.quantity) ?? 1;
  if (quantite <= 0) return undefined;
  return { nom, quantite };
}

/** Ce qui sert à migrer chaque objet de l'inventaire. */
interface ContexteInventaire {
  b: Brouillon;
  regle: RegleInventaire;
  parNom: Map<string, Entree>;
  libreParDefaut: Entree | undefined;
  migres: ObjetsMigres;
}

/**
 * Entrée d'un objet : celle du catalogue, ou à défaut l'entrée libre qui le reçoit,
 * nommée par son exemplaire. `undefined` (avec avertissement) si aucune ne convient.
 */
function entreeObjet(
  ctx: ContexteInventaire,
  o: ObjetInventaireLegacy,
  nom: string,
  quantite: number,
  catalogue: Entree | undefined,
): { e: Entree; champs: Record<string, Valeur> } | undefined {
  if (catalogue) return { e: catalogue, champs: {} };
  const { b, regle, libreParDefaut } = ctx;
  // Hors catalogue : objet personnalisé, nommé par son exemplaire
  const libre = regle.libre?.(o);
  const e = b.entree(libre?.entree) ?? libreParDefaut;
  const nomExemplaire = e && b.systeme.sortes.get(e.sorte)?.nomExemplaire;
  if (!e?.libre || !nomExemplaire) {
    b.avertir(
      `Objet « ${nom} »${quantite > 1 ? ` (×${quantite})` : ''} non migré : absent du catalogue`,
    );
    return undefined;
  }
  return { e, champs: { ...(libre?.entree === e.id ? libre.champs : {}), [nomExemplaire]: nom } };
}

/** Sans quantités : un exemplaire par unité (armes, armures), si la sorte en admet plusieurs. */
function exemplairesParUnite(
  b: Brouillon,
  e: Entree,
  nom: string,
  quantite: number,
  champs: Record<string, Valeur>,
  crees: Possession[],
): void {
  const sorte = b.systeme.sortes.get(e.sorte);
  if (sorte?.quantites || quantite <= 1) return;
  if (!sorte?.exemplaires) {
    b.avertir(`Objet « ${nom} » : ${quantite} exemplaires, un seul migré (${e.nom})`);
    return;
  }
  for (let i = 1; i < quantite; i++) {
    const autre = b.ajouterExemplaire(e.id, { champs: { ...champs } });
    if (autre) crees.push(autre);
  }
}

/**
 * Possessions créées pour un objet : quantité cumulée sur la possession existante
 * (sorte à quantités sans exemplaires), sinon nouveaux exemplaires. `undefined`
 * (avec avertissement) si l'entrée, déjà possédée, n'admet pas d'exemplaire de plus.
 */
function possessionsObjet(
  b: Brouillon,
  e: Entree,
  nom: string,
  quantite: number,
  champs: Record<string, Valeur>,
): Possession[] | undefined {
  const sorte = b.systeme.sortes.get(e.sorte);
  const deja = b.possession(e.id);
  if (sorte?.quantites && !sorte.exemplaires && deja) {
    deja.quantite = quantiteDe(deja) + quantite;
    return [deja];
  }
  const quantites = sorte?.quantites && quantite > 1 ? { quantite } : {};
  const premier = b.ajouterExemplaire(e.id, { ...quantites, champs: { ...champs } });
  if (!premier) {
    b.avertir(`Objet « ${nom} » : ${e.nom} déjà possédé, exemplaire supplémentaire non migré`);
    return undefined;
  }
  const crees: Possession[] = [premier];
  exemplairesParUnite(b, e, nom, quantite, champs, crees);
  return crees;
}

/** Migre un objet d'inventaire ; renvoie la valeur créditée à la monnaie, s'il en est une. */
function migrerObjet(
  ctx: ContexteInventaire,
  doc: DocFirestore<ObjetInventaireLegacy>,
  nom: string,
  quantite: number,
): number | undefined {
  const { b, regle, parNom, migres } = ctx;
  const s = slug(nom);
  const catalogue = b.entree(regle.alias[s]) ?? parNom.get(s);
  const valeur = regle.monnaie?.valeur(s, catalogue);
  if (valeur !== undefined) {
    b.objets.push({
      legacyId: doc.path,
      nom,
      possessions: [],
      credite: { attribut: regle.monnaie!.attribut, valeur: valeur * quantite },
    });
    return valeur * quantite;
  }
  const cible = entreeObjet(ctx, doc.data, nom, quantite, catalogue);
  if (!cible) return undefined;
  const { e, champs } = cible;
  const crees = possessionsObjet(b, e, nom, quantite, champs);
  if (!crees) return undefined;
  const repris: ObjetRepris = { legacyId: doc.path, nom, possessions: crees };
  b.objets.push(repris);
  migres.set(doc.id, {
    entree: e.id,
    ...(crees[0]!.exemplaire !== undefined ? { exemplaire: crees[0]!.exemplaire } : {}),
    avecEffets: e.effets.length > 0,
    repris,
  });
  return undefined;
}

function migrerInventaire(
  b: Brouillon,
  objets: readonly DocFirestore<ObjetInventaireLegacy>[],
  regle: RegleInventaire | undefined,
): ObjetsMigres {
  const migres: ObjetsMigres = new Map();
  let monnaie = 0;
  let monnaieTrouvee = false;
  const parNom = catalogueParNom(b, regle);
  const libreParDefaut = regle ? entreeLibre(b.systeme, regle.sortes) : undefined;

  for (const doc of objets) {
    const objet = objetLegacy(doc.data);
    if (!objet) continue;
    if (!regle) {
      b.avertir(`Objet « ${objet.nom} » non migré : le système n'a pas d'équipement`);
      continue;
    }
    const ctx = { b, regle, parNom, libreParDefaut, migres };
    const credit = migrerObjet(ctx, doc, objet.nom, objet.quantite);
    if (credit !== undefined) {
      monnaie += credit;
      monnaieTrouvee = true;
    }
  }
  if (regle?.monnaie && monnaieTrouvee) b.valeurs[regle.monnaie.attribut] = Math.floor(monnaie);
  return migres;
}

/**
 * Bonus saisis à la main (`Bonus/{room}/{Nomperso}/{id}`), dans tous les
 * systèmes : chaque stat numérique devient un effet « ajouter » sur l'attribut
 * du même nom. Le bonus d'un objet migré devient un effet propre à cet
 * exemplaire ; les autres (capacités, objets absents du catalogue) deviennent
 * des bonus libres nommés. Un bonus inactif est gardé, inactif.
 */
/** Effets d'un bonus legacy : un « ajouter » par stat numérique connue du système. */
function effetsBonus(b: Brouillon, d: BonusLegacy, nom: string): Effet[] {
  const attributs = b.systeme.entites.get('personnage')?.attributs;
  const effets: Effet[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (['active', 'category', 'name', 'diceSelection'].includes(k)) continue;
    const n = nombre(v);
    if (n === undefined || n === 0) continue;
    const a = attributs?.get(k);
    if (!a || (a.nature !== 'base' && a.nature !== 'derivee' && a.nature !== 'ressource')) {
      b.avertir(
        `Bonus « ${nom} » : ${k} ${n > 0 ? '+' : ''}${n} non migré (stat inconnue du système)`,
      );
      continue;
    }
    effets.push({
      sur: 'attribut',
      attribut: k,
      operation: 'ajouter',
      valeur: String(n),
      description: nom,
    });
  }
  return effets;
}

/**
 * Bonus actif d'un objet migré : ses effets vont à l'exemplaire de l'objet.
 * Vrai si le bonus est traité ainsi (ou écarté), faux s'il reste à migrer en bonus libre.
 */
function bonusSurObjet(b: Brouillon, objet: ObjetMigre, nom: string, effets: Effet[]): boolean {
  if (objet.avecEffets) {
    b.avertir(
      `Bonus « ${nom} » non migré : l'objet porte déjà ses effets dans le catalogue (évite de les compter deux fois)`,
    );
    return true;
  }
  const possession = b.possessions.find((p) => estExemplaire(p, objet.entree, objet.exemplaire));
  if (!possession) return false;
  possession.effets = [...possession.effets, ...effets];
  objet.repris.bonus = nom;
  return true;
}

/** Id d'un bonus libre, tiré de son nom ; nom déjà pris : suffixe -2, -3… */
function idBonus(nom: string, ids: Set<string>): string {
  let id = slug(nom).slice(0, 40) || 'bonus';
  let n = 2;
  while (ids.has(id)) id = `${slug(nom).slice(0, 36) || 'bonus'}-${n++}`;
  ids.add(id);
  return id;
}

function migrerBonus(
  b: Brouillon,
  docs: readonly DocFirestore<BonusLegacy>[],
  objets: ObjetsMigres,
): void {
  const ids = new Set<string>();
  for (const doc of docs) {
    const d = doc.data;
    const nom = texte(d.name) ?? doc.id;
    const effets = effetsBonus(b, d, nom);
    if (!effets.length) continue;

    const actif = d.active !== false;
    const objet = objets.get(doc.id);
    if (objet && actif && bonusSurObjet(b, objet, nom, effets)) continue;
    const id = idBonus(nom, ids);
    const source = BONUS_SOURCES[String(d.category)];
    b.bonus.push({ id, nom, ...(source ? { source } : {}), effets, actif });
  }
}

// ─── Star Wars ───────────────────────────────────────────────────────────────

const CARACTERISTIQUES_SW = ['vigueur', 'agilite', 'intellect', 'ruse', 'volonte', 'presence'];

function competencesSw(b: Brouillon, cles: unknown, quoi: string): string[] {
  if (!Array.isArray(cles)) return [];
  const ids: string[] = [];
  for (const k of cles) {
    const id = b.entree(sw.COMPETENCES[String(k)] ?? String(k), 'competence')?.id;
    if (id) ids.push(id);
    else b.avertir(`${quoi} : compétence inconnue « ${String(k)} »`);
  }
  return ids;
}

function specialisationSw(
  b: Brouillon,
  legacyId: string,
  options: OptionsTransformation,
  noeuds: Record<string, number> | undefined,
): string | undefined {
  const nomVo = texte(options.specialisations?.[legacyId]?.name);
  const direct =
    b.entree(nomVo ? sw.SPECIALISATIONS[nomVo] : undefined, 'specialisation') ??
    b.entree(sw.SPECIALISATIONS[legacyId], 'specialisation') ??
    b.entree(slug(legacyId), 'specialisation');
  if (direct) return direct.id;
  // Déduite des nœuds acquis : chaque nœud legacy appartient à un seul arbre
  for (const n of Object.keys(noeuds ?? {})) {
    const arbre = sw.NOEUDS[n]?.split('/')[0];
    const spec = arbre && b.systeme.arbres.get(arbre)?.ouvertPar;
    if (spec) return spec;
  }
  return undefined;
}

type TalentsSw = NonNullable<PersonnageLegacy['unlockedTalents']>;
type PositionsSw = NonNullable<SpecialisationLegacy['talents']>;

/** Espèce legacy → possession. */
function especeSw(b: Brouillon, p: PersonnageLegacy): void {
  const race = texte(p.Race);
  const espece =
    race &&
    (b.entree(sw.ESPECES[race], 'espece') ??
      b.entree(race, 'espece') ??
      b.entree(race.replaceAll('_', '-'), 'espece'));
  if (espece) b.posseder(espece.id);
  else b.avertir(race ? `Espèce inconnue « ${race} »` : 'Aucune espèce');
}

/** Carrière legacy et ses rangs gratuits. */
function carriereSw(b: Brouillon, p: PersonnageLegacy): void {
  const legacyCarriere = texte(p.career) ?? texte(p.Profile);
  const carriere =
    legacyCarriere &&
    (b.entree(sw.CARRIERES[legacyCarriere], 'carriere') ??
      b.entree(slug(legacyCarriere), 'carriere'));
  if (carriere) {
    const pc = b.posseder(carriere.id);
    b.choisir(
      pc,
      'rangs-de-depart',
      competencesSw(b, p.careerSkillChoices, 'Compétences de carrière'),
      `${carriere.nom}, rangs de départ`,
    );
  } else b.avertir(legacyCarriere ? `Carrière inconnue « ${legacyCarriere} »` : 'Aucune carrière');
}

/** Spécialisations listées, plus celles où des talents ont été acquis. */
function specialisationsLegacySw(b: Brouillon, p: PersonnageLegacy, talents: TalentsSw): string[] {
  const legacySpecs = [...(Array.isArray(p.specializations) ? p.specializations : [])];
  for (const id of Object.keys(talents))
    if (
      !legacySpecs.includes(id) &&
      Object.values(talents[id] ?? {}).some((r) => (nombre(r) ?? 0) > 0)
    ) {
      legacySpecs.push(id);
      b.avertir(
        `Talents acquis dans la spécialisation « ${id} », absente de la liste des spécialisations`,
      );
    }
  return legacySpecs;
}

/**
 * Spécialisations possédées (la première porte les rangs gratuits de
 * création) : id legacy → id du catalogue.
 */
function specialisationsSw(
  b: Brouillon,
  p: PersonnageLegacy,
  options: OptionsTransformation,
  talents: TalentsSw,
): Map<string, string> {
  const specs = new Map<string, string>();
  for (const legacyId of specialisationsLegacySw(b, p, talents)) {
    const id = specialisationSw(b, legacyId, options, talents[legacyId]);
    if (!id) {
      b.avertir(
        `Spécialisation inconnue « ${options.specialisations?.[legacyId]?.name ?? legacyId} » (et ses talents)`,
      );
      continue;
    }
    specs.set(legacyId, id);
    const deja = !!b.possession(id);
    const ps = b.posseder(id);
    const choix = p.specializationSkillChoices?.[legacyId];
    if (choix?.length && !deja)
      b.choisir(
        ps,
        'rangs-de-depart',
        competencesSw(b, choix, 'Compétences de spécialisation'),
        `${b.nom(id)}, rangs de départ`,
      );
  }
  return specs;
}

/** Cible (`arbre/nœud`) d'un nœud legacy, retrouvée par position si le MJ a modifié l'arbre. */
function cibleNoeudSw(
  n: string,
  arbre: Arbre | undefined,
  positions: PositionsSw,
): string | undefined {
  const cible = sw.NOEUDS[n];
  if (cible || !arbre) return cible;
  // Arbre modifié par le MJ : même position (x, y) dans l'arbre de la spécialisation
  const pos = positions.find((t) => t.id === n);
  const nn = pos && arbre.noeuds.find((x) => x.x === pos.x && x.y === pos.y);
  return nn ? `${arbre.id}/${nn.id}` : cible;
}

/** Nœud legacy acquis → nœud de l'arbre. */
function noeudSw(
  b: Brouillon,
  n: string,
  rang: number,
  spec: string,
  arbre: Arbre | undefined,
  positions: PositionsSw,
): void {
  if (rang <= 0) return;
  const [a, id] = cibleNoeudSw(n, arbre, positions)?.split('/') ?? [];
  if (!a || !id || !b.systeme.arbres.get(a)?.noeuds.some((x) => x.id === id)) {
    b.avertir(`Talent « ${n} » (${b.nom(spec)}) inconnu, non migré`);
    return;
  }
  if (a !== arbre?.id)
    b.avertir(`Talent « ${n} » rangé dans ${b.nom(spec)} mais appartenant à l'arbre ${a}`);
  if (!(b.noeuds[a] ??= []).includes(id)) b.noeuds[a].push(id);
  if (rang > 1) b.avertir(`Talent « ${n} » : ${rang} rangs sur un seul nœud, 1 migré`);
}

/** Nœuds acquis dans les spécialisations migrées. */
function noeudsSw(
  b: Brouillon,
  options: OptionsTransformation,
  talents: TalentsSw,
  specs: Map<string, string>,
): void {
  for (const [legacySpec, noeuds] of Object.entries(talents)) {
    const spec = specs.get(legacySpec);
    if (!spec) continue;
    const arbre = [...b.systeme.arbres.values()].find((a) => a.ouvertPar === spec);
    const positions = options.specialisations?.[legacySpec]?.talents ?? [];
    for (const [n, r] of Object.entries(noeuds ?? {}))
      noeudSw(b, n, nombre(r) ?? 0, spec, arbre, positions);
  }
}

/** Obligations : un exemplaire par Obligation legacy, même si deux sont du même type. */
function obligationsSw(b: Brouillon, p: PersonnageLegacy): void {
  for (const o of Array.isArray(p.Obligations) ? p.Obligations : []) {
    const valeur = entier(o?.value) ?? 0;
    const detail = texte(o?.text) ?? '';
    if (valeur <= 0 && !detail) continue;
    const s = slug(detail);
    let type = sw.OBLIGATIONS.find(([motif]) => motif.test(s))?.[1];
    if (!type) {
      type = sw.OBLIGATION_PAR_DEFAUT;
      b.avertir(
        `Obligation « ${detail || '(sans texte)'} » (${valeur}) : type deviné, ${b.nom(type)} par défaut`,
      );
    }
    if (!b.entree(type, 'obligation')) continue;
    if (!b.ajouterExemplaire(type, { champs: { valeur, detail } }))
      b.avertir(`Obligation « ${detail} » non migrée : ${b.nom(type)} déjà possédée`);
  }
}

/** Caractéristiques (espèce comprise dans l'ancienne fiche) et rangs de compétence. */
function caracteristiquesEtRangsSw(b: Brouillon, p: PersonnageLegacy): void {
  const caracs: Record<string, number> = {};
  for (const k of CARACTERISTIQUES_SW) {
    const v = entier(p[k]);
    if (v !== undefined) caracs[k] = v;
  }
  b.ajusterBases(caracs);
  const rangs: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.skillRanks ?? {})) {
    const id = b.entree(sw.COMPETENCES[k] ?? k, 'competence')?.id;
    const r = entier(v) ?? 0;
    if (!id) b.avertir(`Compétence inconnue « ${k} » (rang ${r}) non migrée`);
    else if (r > 0) rangs[id] = r;
  }
  b.ajusterRangs(rangs, 'competence');
}

/** Expérience : même reste qu'avant, la dépense passée devient une ligne « migration ». */
function experienceSw(b: Brouillon, p: PersonnageLegacy): void {
  const reste = entier(p.xp);
  const depense = entier(p.xpSpent) ?? 0;
  if (reste === undefined && depense <= 0) return;
  b.valeurs.xpGagne = 0;
  const total0 = detailSolde(b.fiche(), 'xp').total;
  const gagne = (reste ?? 0) + depense - total0;
  b.valeurs.xpGagne = Math.max(0, gagne);
  const cout = depense + Math.max(0, -gagne);
  if (gagne < 0)
    b.avertir(
      `XP : ${total0} XP de départ dans le nouveau système pour ${(reste ?? 0) + depense} au total dans l'ancienne fiche ; ${-gagne} XP comptés en dépense pour garder un reste de ${reste ?? 0}`,
    );
  if (cout > 0)
    b.journal.push({ achat: 'migration', objet: 'legacy', cout, monnaie: 'xp', creation: false });
}

/** Valeur subie d'une jauge legacy (ce qui est subi, ou maximum moins ce qui reste). */
function jaugeSubieSw(
  b: Brouillon,
  p: PersonnageLegacy,
  options: OptionsTransformation,
  cle: string,
  max: string,
): number | undefined {
  const v = entier(p[cle]);
  if (v === undefined) return undefined;
  if (compteSubi(options, cle, true)) return v;
  const m = entier(p[max]);
  if (m === undefined) {
    b.avertir(`${cle} : jauge « restante » sans maximum, ignorée`);
    return undefined;
  }
  return Math.max(0, m - v);
}

/** Seuils : l'ancienne fiche les figeait, le nouveau système les recalcule. */
function seuilsSw(b: Brouillon, p: PersonnageLegacy): void {
  const f = b.fiche();
  for (const [legacy, cle] of Object.entries(sw.SEUILS)) {
    const avant = entier(p[legacy]);
    const apres = Number(f.valeur(cle));
    if (avant !== undefined && avant !== apres)
      b.avertir(
        `${nomAttribut(b.systeme, cle)} : ${avant} dans l'ancienne fiche, ${apres} recalculé`,
      );
  }
}

/** Profil : nom, historique et catégorie. */
function profilSw(b: Brouillon, p: PersonnageLegacy): void {
  const nom = texte(p.Nomperso);
  if (nom) b.valeurs.nom = nom;
  const historique = texte(p.Background);
  if (historique) b.valeurs.historique = historique;
  if (p.type === 'joueurs') b.valeurs.categorie = 'pj';
  else
    b.avertir(
      'PNJ : catégorie (sbire, rival, némésis) à choisir, « personnage joueur » par défaut',
    );
}

function migrerStarWars(b: Brouillon, p: PersonnageLegacy, options: OptionsTransformation): void {
  especeSw(b, p);
  carriereSw(b, p);

  // Spécialisations (la première porte les rangs gratuits de création) et nœuds
  const talents = p.unlockedTalents ?? {};
  const specs = specialisationsSw(b, p, options, talents);
  noeudsSw(b, options, talents, specs);

  obligationsSw(b, p);
  const critiques = entier(p.BlessuresCritiques) ?? 0;
  if (critiques > 0)
    b.avertir(
      `${critiques} blessure(s) critique(s) non migrée(s) : leur type n'était pas enregistré`,
    );

  // Équipement et crédits
  const objets = migrerInventaire(b, options.inventaire ?? [], {
    sortes: ['arme', 'armure', 'objet', 'accessoire', 'devise'],
    alias: sw.EQUIPEMENT,
    monnaie: {
      attribut: 'credits',
      valeur: (_nom, e) =>
        e?.sorte === 'devise' ? Number(e.champs.valeurCredits ?? 1) : undefined,
    },
  });
  if (!b.valeurs.credits) b.valeurs.credits = 0;

  caracteristiquesEtRangsSw(b, p);
  experienceSw(b, p);

  // Blessures et stress : l'ancienne jauge comptait ce qui est subi (Blessures), sauf réglage contraire
  const blessures = jaugeSubieSw(b, p, options, 'PV', 'PV_Max');
  if (blessures !== undefined) b.ressource('blessures', blessures);
  const stress = jaugeSubieSw(b, p, options, 'Stress', 'Stress_Max');
  if (stress !== undefined) b.ressource('stress', stress);

  seuilsSw(b, p);
  profilSw(b, p);

  // Bonus saisis à la main : ajoutés après l'ajustement des bases (l'ancienne fiche les ajoutait à l'affichage)
  migrerBonus(b, options.bonus ?? [], objets);
}

/** Voie legacy (`Chevalier1`, `chevalier1`…) → id du catalogue, sans tenir compte de la casse. */
const VOIES_MINUSCULES = new Map(Object.entries(dnd.VOIES).map(([k, v]) => [k.toLowerCase(), v]));
function voieLegacy(fichier: string): string | undefined {
  return dnd.VOIES[fichier] ?? VOIES_MINUSCULES.get(fichier.toLowerCase());
}

// ─── D&D classique ───────────────────────────────────────────────────────────

const CARACTERISTIQUES = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'];

function caracteristiquesLegacy(p: PersonnageLegacy): Record<string, number> {
  const r: Record<string, number> = {};
  for (const k of CARACTERISTIQUES) {
    const v = entier(p[k]);
    if (v !== undefined) r[k] = v;
  }
  return r;
}

function voiesLegacy(p: PersonnageLegacy): { fichier: string; rang: number }[] {
  const voies: { fichier: string; rang: number }[] = [];
  for (let i = 1; i <= 10; i++) {
    const fichier = texte(p[`Voie${i}`]);
    if (fichier)
      voies.push({ fichier: fichier.replace(/\.json$/, ''), rang: entier(p[`v${i}`]) ?? 0 });
  }
  return voies;
}

function pvLegacy(b: Brouillon, p: PersonnageLegacy, options: OptionsTransformation): void {
  const pv = entier(p.PV);
  if (pv === undefined) return;
  if (compteSubi(options, 'PV', false)) {
    const max = Number(b.fiche().valeur('PV_Max'));
    b.ressource('PV', Math.max(0, max - pv));
  } else b.ressource('PV', pv);
}

/** Race et profil legacy → possessions. */
function raceEtProfilDnd(b: Brouillon, p: PersonnageLegacy): void {
  const race = texte(p.Race);
  const r =
    race &&
    (b.entree(race, 'race') ??
      b.entree(dnd.RACES[slug(race)] ?? slug(race).replaceAll('-', '_'), 'race'));
  if (r) b.posseder(r.id);
  else b.avertir(race ? `Race « ${race} » absente du système` : 'Aucune race');

  const profil = texte(p.Profile);
  const pr = profil && b.entree(dnd.PROFILS[slug(profil)] ?? slug(profil), 'profil');
  if (pr) b.posseder(pr.id);
  else b.avertir(profil ? `Profil inconnu « ${profil} »` : 'Aucun profil');
}

/** Voies legacy et leurs rangs (bornés au maximum du système), sans doublon. */
function voiesDnd(b: Brouillon, p: PersonnageLegacy): [string, number][] {
  const rangs: [string, number][] = [];
  const max = b.systeme.sortes.get('voie')?.rangs
    ? Number(b.fiche().evaluer(b.systeme.formule(chemins.rangsMax('voie')), {}, 0))
    : 0;
  for (const { fichier, rang } of voiesLegacy(p)) {
    const id = b.entree(voieLegacy(fichier), 'voie')?.id;
    if (!id) {
      b.avertir(
        fichier.startsWith('custom:')
          ? `Voie personnalisée « ${fichier.slice(7)} » (rang ${rang}) non migrée`
          : `Voie « ${fichier} » (rang ${rang}) non migrée`,
      );
      continue;
    }
    if (rangs.some(([v]) => v === id)) {
      b.avertir(`Voie ${b.nom(id)} présente deux fois, une seule migrée`);
      continue;
    }
    if (rang > max) b.avertir(`${b.nom(id)} : rang ${rang}, ramené à ${max}`);
    rangs.push([id, Math.max(0, Math.min(rang, max))]);
  }
  return rangs;
}

/** Capacités personnalisées : non migrées, la capacité d'origine s'applique. */
function capacitesPersonnaliseesDnd(
  b: Brouillon,
  p: PersonnageLegacy,
  options: OptionsTransformation,
): void {
  for (const doc of options.competencesPersonnalisees ?? []) {
    const c = doc.data;
    const voie = texte(p[`Voie${(c.voieIndex ?? 0) + 1}`])?.replace(/\.json$/, '');
    const origine = voie && b.entree(voieLegacy(voie), 'voie');
    b.avertir(
      `Capacité personnalisée « ${texte(c.competenceName) ?? doc.id} » (voie ${(c.voieIndex ?? 0) + 1}, rang ${(c.slotIndex ?? 0) + 1}) non migrée${origine ? ` : la capacité d'origine de ${origine.nom} s'applique` : ''}`,
    );
  }
}

function migrerDnd(b: Brouillon, p: PersonnageLegacy, options: OptionsTransformation): void {
  raceEtProfilDnd(b, p);

  const niveau = entier(p.niveau) ?? 1;
  b.valeurs.niveau = Math.max(1, niveau);

  // Voies et leurs rangs, rejoués au journal des points de capacité
  b.rejouerRangs('rang-voie', voiesDnd(b, p));
  capacitesPersonnaliseesDnd(b, p, options);

  // Tout l'inventaire, pièces comprises (objets de la catégorie « bourse ») ; le reste en
  // objets, armes ou protections personnalisés
  const objets = migrerInventaire(b, options.inventaire ?? [], {
    sortes: ['arme', 'armure', 'objet'],
    alias: dnd.EQUIPEMENT,
    libre: dnd.objetLibre,
  });

  // Caractéristiques (race comprise) et PV max (jets de dés de vie), sans les bonus
  // saisis à la main : l'ancienne fiche les ajoutait à l'affichage, comme le nouveau système
  b.ajusterBases(caracteristiquesLegacy(p));
  const pvMax = entier(p.PV_Max);
  if (pvMax !== undefined) b.ajusterPar('jetsDeVie', 'PV_Max', pvMax);
  migrerBonus(b, options.bonus ?? [], objets);
  pvLegacy(b, p, options);

  const pc = detailSolde(b.fiche(), 'pointsCapacite');
  if (pc.solde < 0)
    b.avertir(`Points de capacité : ${pc.depense} dépensés pour ${pc.total} au niveau ${niveau}`);
  if ((entier(p.Stress) ?? 0) > 0) b.avertir('Stress non migré : pas de stress dans ce système');
}

// ─── Vérifications finales ───────────────────────────────────────────────────

/** Choix déjà faits, par sorte (`sorte/choix`). */
function choixFaits(f: Fiche): Set<string> {
  const faits = new Set<string>();
  for (const p of f.possessions.values())
    for (const c of p.entree.choix)
      if (p.possession?.choix[c.id]?.length) faits.add(`${p.sorte.id}/${c.id}`);
  return faits;
}

/** Avertit des choix laissés vides sur une possession. */
function avertirChoixVides(
  b: Brouillon,
  f: Fiche,
  p: PossessionEffective,
  faits: Set<string>,
): void {
  if (p.sorte.rangs && p.rang < 1) return; // voie choisie mais pas encore ouverte
  for (const c of p.entree.choix) {
    if (p.possession?.choix[c.id]?.length || faits.has(`${p.sorte.id}/${c.id}`)) continue;
    if (nombreChoix(f, p.entree.id, c) > 0) b.avertir(`${p.entree.nom} : « ${c.nom} » à choisir`);
  }
  for (const c of p.entree.choixAttributs)
    if (!p.possession?.choix[c.id]?.length) b.avertir(`${p.entree.nom} : « ${c.nom} » à choisir`);
}

/** Avertit des arbres aux talents acquis sans leur spécialisation, ou non reliés. */
function avertirArbres(b: Brouillon, f: Fiche, etat: EtatEntite): void {
  for (const [id, noeuds] of Object.entries(etat.noeuds)) {
    const arbre = b.systeme.arbres.get(id);
    if (!arbre) continue;
    if (arbre.ouvertPar && !f.possessions.has(arbre.ouvertPar))
      b.avertir(`${arbre.nom} : talents acquis sans ${b.nom(arbre.ouvertPar)}`);
    const isoles = noeudsIsoles(arbre, new Set(noeuds));
    if (isoles.length) b.avertir(`${arbre.nom} : nœuds non reliés ${isoles.join(', ')}`);
  }
}

function verifier(b: Brouillon, etat: EtatEntite): void {
  const f = calculer(b.systeme, etat);
  for (const e of f.erreurs) b.avertir(`Calcul : ${e.ou} : ${e.message}`);
  // Choix laissés vides par l'ancienne fiche (sous-espèce, rangs d'espèce, caractéristique d'un
  // talent…). Un choix déjà fait sur une autre entrée de la même sorte ne se refait pas (les rangs
  // gratuits ne concernent que la première spécialisation).
  const faits = choixFaits(f);
  for (const p of f.possessions.values()) avertirChoixVides(b, f, p, faits);
  avertirArbres(b, f, etat);
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

/** Système du personnage : celui imposé, sinon déduit des champs. */
function systemeDe(
  p: PersonnageLegacy,
  options: OptionsTransformation,
  avertir: (m: string) => void,
): string {
  if (options.systemeId) return options.systemeId;
  const d = detecterSysteme(p);
  if (!d.certain) avertir(`Système deviné d'après les champs : ${d.id}`);
  return d.id;
}

/**
 * Migration propre au système. Une donnée imprévue ne doit pas bloquer la migration du
 * lot : l'état construit jusque-là est gardé, l'erreur devient un avertissement.
 */
function migrerSelonSysteme(
  b: Brouillon,
  systemeId: string,
  p: PersonnageLegacy,
  options: OptionsTransformation,
): void {
  try {
    switch (systemeId) {
      case 'star-wars-eote':
        migrerStarWars(b, p, options);
        break;
      // Nooblies hérite de D&D classique (même catalogue, mêmes voies) : même migration
      case 'dnd-classic':
      case 'nooblies':
        migrerDnd(b, p, options);
        break;
      default:
        b.avertir(`Système ${systemeId} sans migration : personnage vide`);
    }
  } catch (e) {
    b.avertir(`Migration interrompue : ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Champs ajoutés à la main sur la fiche (CustomField de l'ancienne app) : sans attribut cible. */
function avertirChampsPersonnalises(p: PersonnageLegacy, avertir: (m: string) => void): void {
  for (const c of Array.isArray(p.customFields) ? (p.customFields as unknown[]) : []) {
    const champ = c as { label?: unknown; value?: unknown };
    if (texte(champ.label) && champ.value !== undefined && champ.value !== '')
      avertir(`Champ personnalisé « ${texte(champ.label)} » (${String(champ.value)}) non migré`);
  }
}

/** État final vérifié et objets repris ; un état invalide donne un personnage vide. */
function etatFinal(
  b: Brouillon,
  systeme: SystemeCharge,
  avertir: (m: string) => void,
): { etat: EtatEntite; objets: ObjetRepris[] } {
  try {
    const etat = b.etat();
    verifier(b, etat);
    const objets = b.objets.map((o) => ({
      ...o,
      possessions: o.possessions.map((x) => structuredClone(x)),
    }));
    return { etat, objets };
  } catch (e) {
    avertir(`État invalide, personnage vide : ${e instanceof Error ? e.message : String(e)}`);
    return { etat: new Brouillon(systeme, avertir).etat(), objets: [] };
  }
}

/** Textes et mesures sans place dans les règles ; l'historique déjà repris n'est pas doublé. */
function detailsDe(p: PersonnageLegacy, b: Brouillon): Record<string, string | number> {
  const details: Record<string, string | number> = {};
  for (const k of ['Description', 'Background', 'Taille', 'Poids'] as const) {
    const v = typeof p[k] === 'number' ? (p[k] as number) : texte(p[k]);
    if (v !== undefined && !(k === 'Background' && b.valeurs.historique === v)) details[k] = v;
  }
  return details;
}

export function transformerPersonnage(
  doc: DocFirestore<PersonnageLegacy>,
  options: OptionsTransformation,
): PersonnageMigre {
  const p = doc.data ?? {};
  const avertissements: string[] = [];
  const avertir = (m: string) => {
    if (!avertissements.includes(m)) avertissements.push(m);
  };

  const systemeId = systemeDe(p, options, avertir);
  const systeme = options.systemes[systemeId];
  if (!systeme) throw new Error(`Système non chargé : ${systemeId}`);

  const b = new Brouillon(systeme, avertir);
  migrerSelonSysteme(b, systemeId, p, options);
  avertirChampsPersonnalises(p, avertir);
  const { etat, objets } = etatFinal(b, systeme, avertir);

  const details = detailsDe(p, b);
  const image = texte(p.imageURL);
  if (image?.startsWith('/'))
    avertir(`Avatar « ${image} » : image de l'ancienne app, à reprendre dans le stockage`);

  return {
    etat,
    nom: texte(p.Nomperso) ?? 'Sans nom',
    avatarUrl: image ?? null,
    legacy: {
      id: doc.id,
      ...originePersonnage(doc.path),
      ...(texte(p.type) ? { type: texte(p.type)! } : {}),
    },
    details,
    objets,
    avertissements,
  };
}

const BONUS_SOURCES: Partial<Record<string, string>> = {
  Competence: 'Capacité',
  Inventaire: 'Inventaire',
};
