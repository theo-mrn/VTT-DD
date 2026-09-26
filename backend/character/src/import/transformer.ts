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
  examinerAchat,
  nombreChoix,
  noeudsIsoles,
  nouvellePossession,
  type BonusLibre,
  type Effet,
  type Entree,
  type Fiche,
  type LigneJournal,
  type Possession,
  type SystemeCharge,
} from '@vtt/rules';
import * as dnd from './correspondances/dnd-classic.js';
import * as nooblies from './correspondances/nooblies.js';
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
}

/**
 * Objets d'inventaire → possessions (une par entrée) ou monnaie. Renvoie les
 * ids des objets devenus des entrées à effets, dont les bonus saisis à la
 * main feraient double emploi.
 */
/** Objets migrés : id du document legacy → entrée possédée, et si elle porte des effets. */
type ObjetsMigres = Map<string, { entree: string; avecEffets: boolean }>;

function migrerInventaire(
  b: Brouillon,
  objets: readonly DocFirestore<ObjetInventaireLegacy>[],
  regle: RegleInventaire | undefined,
): ObjetsMigres {
  const migres: ObjetsMigres = new Map();
  let monnaie = 0;
  let monnaieTrouvee = false;
  const parNom = new Map<string, Entree>();
  for (const e of b.systeme.entrees.values())
    if (regle?.sortes.includes(e.sorte)) {
      parNom.set(slug(e.nom), e);
      parNom.set(e.id, e);
    }

  for (const doc of objets) {
    const o = doc.data;
    if (o.isFolder) continue;
    const nom = texte(o.message);
    if (!nom) continue;
    const quantite = entier(o.quantity) ?? 1;
    if (quantite <= 0) continue;
    if (!regle) {
      b.avertir(`Objet « ${nom} » non migré : le système n'a pas d'équipement`);
      continue;
    }
    const s = slug(nom);
    const e = b.entree(regle.alias[s]) ?? parNom.get(s);
    const valeur = regle.monnaie?.valeur(s, e);
    if (valeur !== undefined) {
      monnaie += valeur * quantite;
      monnaieTrouvee = true;
      continue;
    }
    if (!e) {
      b.avertir(
        `Objet « ${nom} »${quantite > 1 ? ` (×${quantite})` : ''} non migré : absent du catalogue`,
      );
      continue;
    }
    if (b.possession(e.id)) {
      b.avertir(`Objet « ${nom} » : ${e.nom} déjà possédé, exemplaire supplémentaire non migré`);
      continue;
    }
    b.posseder(e.id);
    if (quantite > 1)
      b.avertir(`Objet « ${nom} » : ${quantite} exemplaires, un seul migré (${e.nom})`);
    migres.set(doc.id, { entree: e.id, avecEffets: e.effets.length > 0 });
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
function migrerBonus(
  b: Brouillon,
  docs: readonly DocFirestore<BonusLegacy>[],
  objets: ObjetsMigres,
): void {
  const attributs = b.systeme.entites.get('personnage')?.attributs;
  const ids = new Set<string>();
  for (const doc of docs) {
    const d = doc.data;
    const nom = texte(d.name) ?? doc.id;
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
    if (!effets.length) continue;

    const actif = d.active !== false;
    const objet = objets.get(doc.id);
    if (objet && actif) {
      if (objet.avecEffets) {
        b.avertir(
          `Bonus « ${nom} » non migré : l'objet porte déjà ses effets dans le catalogue (évite de les compter deux fois)`,
        );
        continue;
      }
      const possession = b.possession(objet.entree);
      if (possession) {
        possession.effets = [...possession.effets, ...effets];
        continue;
      }
    }
    let id = slug(nom).slice(0, 40) || 'bonus';
    for (let n = 2; ids.has(id); n++) id = `${slug(nom).slice(0, 36) || 'bonus'}-${n}`;
    ids.add(id);
    const source =
      d.category === 'Competence'
        ? 'Capacité'
        : d.category === 'Inventaire'
          ? 'Inventaire'
          : undefined;
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

function migrerStarWars(b: Brouillon, p: PersonnageLegacy, options: OptionsTransformation): void {
  // Espèce
  const race = texte(p.Race);
  const espece =
    race &&
    (b.entree(sw.ESPECES[race], 'espece') ??
      b.entree(race, 'espece') ??
      b.entree(race.replace(/_/g, '-'), 'espece'));
  if (espece) b.posseder(espece.id);
  else b.avertir(race ? `Espèce inconnue « ${race} »` : 'Aucune espèce');

  // Carrière et ses rangs gratuits
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

  // Spécialisations (la première porte les rangs gratuits de création) et nœuds
  const talents = p.unlockedTalents ?? {};
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
  const specs = new Map<string, string>();
  for (const legacyId of legacySpecs) {
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
  for (const [legacySpec, noeuds] of Object.entries(talents)) {
    const spec = specs.get(legacySpec);
    if (!spec) continue;
    const arbre = [...b.systeme.arbres.values()].find((a) => a.ouvertPar === spec);
    const positions = options.specialisations?.[legacySpec]?.talents ?? [];
    for (const [n, r] of Object.entries(noeuds ?? {})) {
      const rang = nombre(r) ?? 0;
      if (rang <= 0) continue;
      let cible = sw.NOEUDS[n];
      if (!cible && arbre) {
        // Arbre modifié par le MJ : même position (x, y) dans l'arbre de la spécialisation
        const pos = positions.find((t) => t.id === n);
        const nn = pos && arbre.noeuds.find((x) => x.x === pos.x && x.y === pos.y);
        if (nn) cible = `${arbre.id}/${nn.id}`;
      }
      const [a, id] = cible?.split('/') ?? [];
      if (!a || !id || !b.systeme.arbres.get(a)?.noeuds.some((x) => x.id === id)) {
        b.avertir(`Talent « ${n} » (${b.nom(spec)}) inconnu, non migré`);
        continue;
      }
      if (a !== arbre?.id)
        b.avertir(`Talent « ${n} » rangé dans ${b.nom(spec)} mais appartenant à l'arbre ${a}`);
      if (!(b.noeuds[a] ??= []).includes(id)) b.noeuds[a].push(id);
      if (rang > 1) b.avertir(`Talent « ${n} » : ${rang} rangs sur un seul nœud, 1 migré`);
    }
  }

  // Obligations : une possession par type (valeurs cumulées si deux textes tombent sur le même)
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
    const deja = b.possession(type);
    if (deja) {
      deja.champs.valeur = Number(deja.champs.valeur ?? 0) + valeur;
      deja.champs.detail = [deja.champs.detail, detail].filter(Boolean).join(' ; ');
      b.avertir(`Obligations cumulées sur ${b.nom(type)} : « ${deja.champs.detail} »`);
    } else b.posseder(type, { champs: { valeur, detail } });
  }
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

  // Caractéristiques (espèce comprise dans l'ancienne fiche) et rangs de compétence
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

  // Expérience : même reste qu'avant, la dépense passée devient une ligne « migration »
  const reste = entier(p.xp);
  const depense = entier(p.xpSpent) ?? 0;
  if (reste !== undefined || depense > 0) {
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

  // Blessures et stress : l'ancienne jauge comptait ce qui est subi (Blessures), sauf réglage contraire
  const ancienne = (cle: string, max: string) => {
    const v = entier(p[cle]);
    if (v === undefined) return undefined;
    if (compteSubi(options, cle, true)) return v;
    const m = entier(p[max]);
    if (m === undefined) {
      b.avertir(`${cle} : jauge « restante » sans maximum, ignorée`);
      return undefined;
    }
    return Math.max(0, m - v);
  };
  const blessures = ancienne('PV', 'PV_Max');
  if (blessures !== undefined) b.ressource('blessures', blessures);
  const stress = ancienne('Stress', 'Stress_Max');
  if (stress !== undefined) b.ressource('stress', stress);

  // Seuils : l'ancienne fiche les figeait, le nouveau système les recalcule
  const f = b.fiche();
  for (const [legacy, cle] of [
    ['PV_Max', 'seuilBlessure'],
    ['Stress_Max', 'seuilStress'],
  ] as const) {
    const avant = entier(p[legacy]);
    const apres = Number(f.valeur(cle));
    if (avant !== undefined && avant !== apres)
      b.avertir(
        `${nomAttribut(b.systeme, cle)} : ${avant} dans l'ancienne fiche, ${apres} recalculé`,
      );
  }

  // Profil
  const nom = texte(p.Nomperso);
  if (nom) b.valeurs.nom = nom;
  const historique = texte(p.Background);
  if (historique) b.valeurs.historique = historique;
  if (p.type === 'joueurs') b.valeurs.categorie = 'pj';
  else
    b.avertir(
      'PNJ : catégorie (sbire, rival, némésis) à choisir, « personnage joueur » par défaut',
    );

  // Bonus saisis à la main : ajoutés après l'ajustement des bases (l'ancienne fiche les ajoutait à l'affichage)
  migrerBonus(b, options.bonus ?? [], objets);
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

function migrerDnd(b: Brouillon, p: PersonnageLegacy, options: OptionsTransformation): void {
  const race = texte(p.Race);
  const r =
    race &&
    (b.entree(race, 'race') ??
      b.entree(dnd.RACES[slug(race)] ?? slug(race).replace(/-/g, '_'), 'race'));
  if (r) b.posseder(r.id);
  else b.avertir(race ? `Race « ${race} » absente du système` : 'Aucune race');

  const profil = texte(p.Profile);
  const pr = profil && b.entree(dnd.PROFILS[slug(profil)] ?? slug(profil), 'profil');
  if (pr) b.posseder(pr.id);
  else b.avertir(profil ? `Profil inconnu « ${profil} »` : 'Aucun profil');

  const niveau = entier(p.niveau) ?? 1;
  b.valeurs.niveau = Math.max(1, niveau);

  // Voies et leurs rangs, rejoués au journal des points de capacité
  const rangs: [string, number][] = [];
  const max = b.systeme.sortes.get('voie')?.rangs
    ? Number(b.fiche().evaluer(b.systeme.formule(chemins.rangsMax('voie')), {}, 0))
    : 0;
  for (const { fichier, rang } of voiesLegacy(p)) {
    const id = b.entree(dnd.VOIES[fichier], 'voie')?.id;
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
  b.rejouerRangs('rang-voie', rangs);
  for (const doc of options.competencesPersonnalisees ?? []) {
    const c = doc.data;
    const voie = texte(p[`Voie${(c.voieIndex ?? 0) + 1}`])?.replace(/\.json$/, '');
    const origine = voie && b.entree(dnd.VOIES[voie], 'voie');
    b.avertir(
      `Capacité personnalisée « ${texte(c.competenceName) ?? doc.id} » (voie ${(c.voieIndex ?? 0) + 1}, rang ${(c.slotIndex ?? 0) + 1}) non migrée${origine ? ` : la capacité d'origine de ${origine.nom} s'applique` : ''}`,
    );
  }

  const objets = migrerInventaire(b, options.inventaire ?? [], {
    sortes: ['arme', 'armure'],
    alias: dnd.EQUIPEMENT,
    monnaie: { attribut: 'bourse', valeur: (nom) => dnd.PIECES[nom] },
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

// ─── Noobliés ────────────────────────────────────────────────────────────────

function migrerNooblies(b: Brouillon, p: PersonnageLegacy, options: OptionsTransformation): void {
  const race = texte(p.Race);
  const r = race && b.entree(nooblies.RACES[race] ?? slug(race), 'race');
  if (r) b.posseder(r.id);
  else b.avertir(race ? `Race inconnue « ${race} »` : 'Aucune race');
  const profil = texte(p.Profile);
  const pr = profil && b.entree(nooblies.PROFILS[profil] ?? slug(profil), 'profil');
  if (pr) b.posseder(pr.id);
  else b.avertir(profil ? `Profil inconnu « ${profil} »` : 'Aucun profil');

  for (const { fichier, rang } of voiesLegacy(p))
    b.avertir(`Voie « ${fichier} » (rang ${rang}) non migrée : pas de voies dans ce système`);
  const objets = migrerInventaire(b, options.inventaire ?? [], undefined);

  // Bases et PV max sans les bonus saisis à la main, ajoutés ensuite comme à l'affichage
  b.ajusterBases(caracteristiquesLegacy(p));
  const pvMax = entier(p.PV_Max);
  if (pvMax !== undefined) b.ajusterPar('jetDeVie', 'PV_Max', pvMax);
  migrerBonus(b, options.bonus ?? [], objets);
  pvLegacy(b, p, options);
  const niveau = entier(p.niveau);
  if (niveau !== undefined && niveau > 1)
    b.avertir(`Niveau ${niveau} non migré : pas de niveaux dans ce système`);
}

// ─── Vérifications finales ───────────────────────────────────────────────────

function verifier(b: Brouillon, etat: EtatEntite): void {
  const f = calculer(b.systeme, etat);
  for (const e of f.erreurs) b.avertir(`Calcul : ${e.ou} : ${e.message}`);
  // Choix laissés vides par l'ancienne fiche (sous-espèce, rangs d'espèce, caractéristique d'un
  // talent…). Un choix déjà fait sur une autre entrée de la même sorte ne se refait pas (les rangs
  // gratuits ne concernent que la première spécialisation).
  const faits = new Set<string>();
  for (const p of f.possessions.values())
    for (const c of p.entree.choix)
      if (p.possession?.choix[c.id]?.length) faits.add(`${p.sorte.id}/${c.id}`);
  for (const p of f.possessions.values()) {
    if (p.sorte.rangs && p.rang < 1) continue; // voie choisie mais pas encore ouverte
    for (const c of p.entree.choix) {
      if (p.possession?.choix[c.id]?.length || faits.has(`${p.sorte.id}/${c.id}`)) continue;
      if (nombreChoix(f, p.entree.id, c) > 0) b.avertir(`${p.entree.nom} : « ${c.nom} » à choisir`);
    }
    for (const c of p.entree.choixAttributs)
      if (!p.possession?.choix[c.id]?.length) b.avertir(`${p.entree.nom} : « ${c.nom} » à choisir`);
  }
  for (const [id, noeuds] of Object.entries(etat.noeuds)) {
    const arbre = b.systeme.arbres.get(id);
    if (!arbre) continue;
    if (arbre.ouvertPar && !f.possessions.has(arbre.ouvertPar))
      b.avertir(`${arbre.nom} : talents acquis sans ${b.nom(arbre.ouvertPar)}`);
    const isoles = noeudsIsoles(arbre, new Set(noeuds));
    if (isoles.length) b.avertir(`${arbre.nom} : nœuds non reliés ${isoles.join(', ')}`);
  }
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

export function transformerPersonnage(
  doc: DocFirestore<PersonnageLegacy>,
  options: OptionsTransformation,
): PersonnageMigre {
  const p = doc.data ?? {};
  const avertissements: string[] = [];
  const avertir = (m: string) => {
    if (!avertissements.includes(m)) avertissements.push(m);
  };

  let systemeId = options.systemeId;
  if (!systemeId) {
    const d = detecterSysteme(p);
    systemeId = d.id;
    if (!d.certain) avertir(`Système deviné d'après les champs : ${d.id}`);
  }
  const systeme = options.systemes[systemeId];
  if (!systeme) throw new Error(`Système non chargé : ${systemeId}`);

  const b = new Brouillon(systeme, avertir);
  // Une donnée imprévue ne doit pas bloquer la migration du lot : l'état construit jusque-là
  // est gardé, l'erreur devient un avertissement
  try {
    switch (systemeId) {
      case 'star-wars-eote':
        migrerStarWars(b, p, options);
        break;
      case 'dnd-classic':
        migrerDnd(b, p, options);
        break;
      case 'nooblies':
        migrerNooblies(b, p, options);
        break;
      default:
        avertir(`Système ${systemeId} sans migration : personnage vide`);
    }
  } catch (e) {
    avertir(`Migration interrompue : ${e instanceof Error ? e.message : String(e)}`);
  }

  // Champs ajoutés à la main sur la fiche (CustomField de l'ancienne app) : sans attribut cible
  for (const c of Array.isArray(p.customFields) ? (p.customFields as unknown[]) : []) {
    const champ = c as { label?: unknown; value?: unknown };
    if (texte(champ.label) && champ.value !== undefined && champ.value !== '')
      avertir(`Champ personnalisé « ${texte(champ.label)} » (${String(champ.value)}) non migré`);
  }

  let etat: EtatEntite;
  try {
    etat = b.etat();
    verifier(b, etat);
  } catch (e) {
    avertir(`État invalide, personnage vide : ${e instanceof Error ? e.message : String(e)}`);
    etat = new Brouillon(systeme, avertir).etat();
  }

  const details: Record<string, string | number> = {};
  for (const k of ['Description', 'Background', 'Taille', 'Poids'] as const) {
    const v = typeof p[k] === 'number' ? (p[k] as number) : texte(p[k]);
    if (v !== undefined && !(k === 'Background' && b.valeurs.historique === v)) details[k] = v;
  }
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
    avertissements,
  };
}
