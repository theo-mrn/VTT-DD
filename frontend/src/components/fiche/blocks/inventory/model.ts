/**
 * Modèle du bloc Inventaire, sans React : tout ce que le bloc affiche est déduit du
 * système chargé (sortes, champs, `exemplaires`, `quantites`, effets, achats, formules des
 * attributs) et de la déclaration du widget. Aucune clé de jeu en dur.
 *
 * Aperçus d'écriture : chaque opération calcule l'état attendu, montré aussitôt, et la
 * demande envoyée au service character (même règle que `poserPossession` côté serveur).
 */
import {
  achatsPossibles,
  apercuFormule,
  declarationsJetables,
  champsGroupe,
  champsActifs,
  chemins,
  compilerFormuleChamp,
  formuleChamp,
  formuleLisible,
  variablesObjet,
  descriptionPossession,
  essayer,
  estEffective,
  estExemplaire,
  nomPossession,
  nouvelExemplaire,
  nouvellePossession,
  quantiteDe,
  reporterEffetsDesactives,
  soldes,
  sourceExemplaire,
  type Champ,
  type Effet,
  type Entree,
  type EtatEntite,
  type Fiche,
  type InventoryFolder,
  type Noeud,
  type ObjetAchetable,
  type Possession,
  type PossessionEffective,
  type Sorte,
  type SoldeMonnaie,
  type SystemeCharge,
  type Valeur,
  type Widget,
} from '@vtt/rules';

export type InventoryWidget = Extract<Widget, { type: 'inventaire' }>;
export type ValeurChamp = number | string | boolean;

/** Demande de possession : celle de `DemandePossession`, plus les champs propres d'un exemplaire. */
export interface InventoryRequest {
  entree: string;
  exemplaire?: string;
  nouveau?: boolean;
  quantite?: number;
  rang?: number;
  actif?: boolean;
  choix?: Record<string, string[]>;
  champs?: Record<string, ValeurChamp>;
  effets?: Effet[];
  /** Caché aux autres joueurs. */
  hidden?: boolean;
  /** Dossier d'inventaire ; null : à la racine. */
  folder?: string | null;
}

// ─── Bonus des effets ────────────────────────────────────────────────────────

export interface BonusLabel {
  texte: string;
  /** L'effet ne s'applique que sous condition. */
  conditionnel: boolean;
  /** Effet écarté par le calcul (famille non cumulable) alors que l'objet est actif. */
  ignore: boolean;
  description?: string;
}

function signe(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function arrondi(v: Valeur): Valeur {
  return typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
}

/** Valeur d'un champ pour une possession : celle de l'exemplaire, sinon celle de l'entrée. */
export function champDe(
  entree: Entree,
  champ: Champ,
  possession?: Possession,
): ValeurChamp | string[] | undefined {
  const propre = possession?.champs[champ.id];
  if (propre !== undefined) return propre;
  const v = entree.champs[champ.id];
  if (v !== undefined) return v;
  return 'defaut' in champ ? champ.defaut : undefined;
}

/** Variables d'un effet (`rang`, `actif`, `quantite`, `source.<champ>`), comme le moteur. */
function variablesEffet(
  fiche: Fiche,
  entree: Entree,
  sorte: Sorte,
  p: PossessionEffective | undefined,
  ex: Possession | undefined,
): (nom: string) => Valeur {
  return (nom) => {
    if (nom === 'rang') return p?.rang ?? 0;
    if (nom === 'actif') return ex ? !sorte.activable || ex.actif : (p?.actif ?? true);
    if (nom === 'quantite') return ex ? quantiteDe(ex) : (p?.quantite ?? 1);
    if (nom.startsWith('source.')) {
      const id = nom.slice('source.'.length);
      const def = sorte.champs.find((c) => c.id === id);
      if (def?.type === 'formule') {
        const f = fiche.systeme.formules.get(chemins.champ(entree.id, id));
        const r = f ? essayer(fiche, f) : undefined;
        return r?.ok ? r.valeur : 0;
      }
      const v = def ? champDe(entree, def, ex) : entree.champs[id];
      if (Array.isArray(v)) return v.join(',');
      return v ?? valeurVide(def?.type);
    }
    throw new Error(`Variable inconnue : ${nom}`);
  };
}

/** Valeur d'un champ absent, selon son type. */
function valeurVide(type: string | undefined): boolean | number | string {
  if (type === 'booleen') return false;
  return type === 'nombre' ? 0 : '';
}

function nomAttribut(fiche: Fiche, cle: string): string {
  const a = fiche.entite.attributs.get(cle);
  return a?.abrege ?? a?.nom ?? cle;
}

function nomDe(systeme: SystemeCharge, id: string): string {
  return systeme.source.des?.sortes.find((d) => d.id === id)?.nom ?? id;
}

/** Libellé d'un effet d'entrée ou d'exemplaire, valeurs évaluées quand c'est possible. */
export function libelleEffet(
  fiche: Fiche,
  e: Effet,
  valeur: (champ: string) => Valeur | undefined,
): string | null {
  const nombre = (champ: string, brut: string) => {
    const v = valeur(champ);
    return v === undefined ? brut : arrondi(v);
  };
  switch (e.sur) {
    case 'attribut': {
      const nom = nomAttribut(fiche, e.attribut);
      const v = nombre('valeur', e.valeur);
      switch (e.operation) {
        case 'ajouter':
          return typeof v === 'number' ? `${nom} ${signe(v)}` : `${nom} + ${v}`;
        case 'multiplier':
          return `${nom} ×${v}`;
        case 'fixer':
          return `${nom} = ${v}`;
        case 'minimum':
          return `${nom} ≥ ${v}`;
        case 'maximum':
          return `${nom} ≤ ${v}`;
      }
      return null;
    }
    case 'jet': {
      if (e.description) return e.description;
      const a = e.ajout;
      let texte: string | null = null;
      if (a && 'de' in a)
        texte = `+${nombre('ajout/nombre', a.nombre)} ${nomDe(fiche.systeme, a.de)}`;
      else if (a && 'ameliorer' in a)
        texte = `${nomDe(fiche.systeme, a.ameliorer)} → ${nomDe(fiche.systeme, a.vers)} ×${nombre('ajout/nombre', a.nombre)}`;
      else if (a && 'retrograder' in a)
        texte = `${nomDe(fiche.systeme, a.retrograder)} → ${nomDe(fiche.systeme, a.vers)} ×${nombre('ajout/nombre', a.nombre)}`;
      else if (a && 'retirer' in a)
        texte = `−${nombre('ajout/nombre', a.nombre)} ${nomDe(fiche.systeme, a.retirer)}`;
      else if (a && 'variable' in a) {
        const v = nombre('ajout/ajouter', a.ajouter);
        texte = `${a.variable} ${typeof v === 'number' ? signe(v) : `+ ${v}`}`;
      } else if (a && 'bonus' in a) {
        const v = nombre('ajout/bonus', a.bonus);
        texte = `${typeof v === 'number' ? signe(v) : `+ ${v}`} au jet`;
      }
      if (!texte) return 'Modifie certains jets';
      let cible: string | undefined;
      if (e.implique?.entree) cible = fiche.systeme.entrees.get(e.implique.entree)?.nom;
      else if (e.implique?.attribut) cible = nomAttribut(fiche, e.implique.attribut);
      else if (e.actions?.length === 1) cible = fiche.systeme.actions.get(e.actions[0]!)?.nom;
      const cote = e.cote === 'cible' ? ' (en défense)' : '';
      return cible ? `${texte} · ${cible}${cote}` : `${texte}${cote}`;
    }
    case 'degats': {
      if (e.operation === 'annuler') return e.description ?? 'Immunité';
      const v = nombre('valeur', e.valeur);
      return e.operation === 'multiplier' ? `Dégâts ×${v}` : `Réduction des dégâts ${v}`;
    }
    case 'rang': {
      const cible = fiche.systeme.entrees.get(e.entree)?.nom ?? e.entree;
      return e.description ?? `Accorde : ${cible}`;
    }
    case 'marque':
      return e.description ?? null;
  }
}

/**
 * Bonus d'une possession : effets du catalogue de l'entrée, puis effets propres à
 * l'exemplaire. Valeurs évaluées sur la fiche (`source.def` → 2).
 */
export function bonusDe(
  fiche: Fiche,
  entree: Entree,
  sorte: Sorte,
  p: PossessionEffective | undefined,
  ex: Possession | undefined,
): BonusLabel[] {
  const variable = variablesEffet(fiche, entree, sorte, p, ex);
  const actif = ex ? !sorte.activable || ex.actif : (p?.actif ?? false);
  const r: BonusLabel[] = [];
  // « Défense +0 » : un ajout nul n'est pas un bonus
  const nul = (e: Effet, valeur: (champ: string) => Valeur | undefined) =>
    e.sur === 'attribut' && e.operation === 'ajouter' && valeur('valeur') === 0;
  const ignoreDans = (source: string, e: Effet) =>
    actif &&
    e.sur === 'attribut' &&
    Boolean(
      fiche.valeurs
        .get(e.attribut)
        // Non cumulé, ou coupé depuis le bloc Bonus : l'effet n'est pas appliqué
        ?.detail.some((l) => l.source === source && (l.ignore === true || l.desactive === true)),
    );

  entree.effets.forEach((e, i) => {
    const valeur = (champ: string) => {
      const f = fiche.systeme.formules.get(chemins.effet(entree.id, i, champ));
      if (!f) return undefined;
      const res = essayer(fiche, f, { variable });
      return res.ok ? res.valeur : undefined;
    };
    if (nul(e, valeur)) return;
    const texte = libelleEffet(fiche, e, valeur);
    if (texte)
      r.push({
        texte,
        conditionnel: e.condition !== undefined,
        ignore: ignoreDans(entree.id, e),
        ...(e.description ? { description: e.description } : {}),
      });
  });

  // Effets propres : formules compilées par le moteur seulement ; valeur lue dans
  // l'explication de l'attribut (objet actif), sinon valeur littérale.
  const source = ex ? sourceExemplaire(ex) : undefined;
  for (const e of ex?.effets ?? []) {
    const valeur = (champ: string): Valeur | undefined => {
      if (champ === 'valeur' && e.sur === 'attribut') {
        const ligne = fiche.valeurs
          .get(e.attribut)
          ?.detail.find((l) => l.source === source && l.operation === e.operation);
        if (ligne) return ligne.valeur;
      }
      const brut = champ === 'valeur' && 'valeur' in e ? Number(e.valeur) : Number.NaN;
      return Number.isFinite(brut) ? brut : undefined;
    };
    if (nul(e, valeur)) continue;
    const texte = libelleEffet(fiche, e, valeur);
    if (texte)
      r.push({
        texte,
        conditionnel: e.condition !== undefined,
        ignore: source ? ignoreDans(source, e) : false,
        ...(e.description ? { description: e.description } : {}),
      });
  }
  return r;
}

// ─── Charge (poids, encombrement) ────────────────────────────────────────────

/**
 * Agrégats du moteur qui additionnent un champ numérique des objets d'une sorte de
 * l'inventaire : ceux portés (`somme_actifs("arme", "encombrement")`, sorte équipable) ou
 * tous ceux possédés (`somme("objet", "poids")`). Hors des sortes de l'inventaire (total
 * d'Obligation, dé de vie du profil), une somme n'est pas une charge.
 */
const AGREGATS_CHARGE = new Set(['somme_actifs', 'somme']);

/** Charge lisible : deux décimales au plus (des poids de 0,01 kg s'additionnent mal en flottants). */
const arrondiCharge = (n: number) => Math.round(n * 100) / 100;

function parcourir(n: Noeud, visite: (n: Noeud) => void) {
  visite(n);
  switch (n.t) {
    case 'appel':
      n.args.forEach((a) => parcourir(a, visite));
      break;
    case 'unaire':
      parcourir(n.arg, visite);
      break;
    case 'binaire':
      parcourir(n.g, visite);
      parcourir(n.d, visite);
      break;
    case 'si':
      parcourir(n.condition, visite);
      parcourir(n.alors, visite);
      parcourir(n.sinon, visite);
      break;
    case 'des':
      parcourir(n.nombre, visite);
      parcourir(n.faces, visite);
      if (n.garder) parcourir(n.garder.n, visite);
      break;
  }
}

export interface Charge {
  /** Attribut calculé qui additionne un champ numérique des sortes de l'inventaire. */
  cle: string;
  nom: string;
  valeur: number;
  /** Attributs du même groupe lus avec lui par un attribut qui en dépend (seuil…). */
  limite?: { cle: string; nom: string; valeur: number };
  /** Attributs qui en dépendent : excédent, surcharge (vrais ou non nuls seulement). */
  alertes: { cle: string; nom: string; valeur: Valeur }[];
}

export interface ChargeInventaire {
  /** Champ additionné, par sorte (le poids ou l'encombrement d'un objet). */
  champs: Map<string, Champ>;
  charges: Charge[];
}

/**
 * Charge déclarée par le système : un attribut dérivé dont la formule additionne
 * (`somme_actifs` ou `somme`) un champ numérique des objets d'une sorte de l'inventaire.
 * Aucun nom de champ supposé : c'est la formule du système qui désigne le poids. Une charge
 * d'une règle optionnelle éteinte pour la campagne n'est pas montrée, ni le poids des objets.
 */
export function chargeInventaire(
  fiche: Fiche,
  sortes: readonly string[],
  mj = false,
): ChargeInventaire {
  const { systeme, entite } = fiche;
  const champs = new Map<string, Champ>();
  const charges: Charge[] = [];
  const type = fiche.etat.type;
  const formule = (cle: string) => systeme.formules.get(chemins.attribut(type, cle, 'formule'));
  const visible = (a: { cle: string; visibilite: string }) =>
    fiche.attributActif(a.cle) && (mj || a.visibilite !== 'mj');

  for (const a of entite.attributs.values()) {
    // Une charge d'une règle optionnelle éteinte (encombrement) n'est pas sur la fiche
    if (a.nature !== 'derivee' || a.type !== 'nombre' || !visible(a)) continue;
    const f = formule(a.cle);
    if (!f) continue;
    let lit = false;
    parcourir(f.noeud, (n) => {
      if (n.t !== 'appel' || !AGREGATS_CHARGE.has(n.fn)) return;
      const [s, c] = n.args;
      if (s?.t !== 'texte' || c?.t !== 'texte' || !sortes.includes(s.v)) return;
      const sorte = systeme.sortes.get(s.v);
      const champ = sorte?.champs.find((x) => x.id === c.v);
      if (!sorte || champ?.type !== 'nombre') return;
      if (n.fn === 'somme_actifs' && !sorte.activable) return;
      champs.set(s.v, champ);
      lit = true;
    });
    if (!lit) continue;
    const dependants = [...entite.attributs.values()].filter(
      (d) => d.cle !== a.cle && visible(d) && formule(d.cle)?.dependances.has(a.cle) === true,
    );
    let limite: Charge['limite'];
    for (const d of dependants) {
      for (const cle of formule(d.cle)?.dependances ?? []) {
        const l = entite.attributs.get(cle);
        if (!l || l.cle === a.cle || l.groupe !== a.groupe || !visible(l)) continue;
        const v = fiche.valeur(cle);
        if (typeof v === 'number' && !limite)
          limite = { cle, nom: l.nom, valeur: arrondiCharge(v) };
      }
    }
    const alertes = dependants
      .map((d) => ({ cle: d.cle, nom: d.nom, valeur: fiche.valeur(d.cle) }))
      .filter((d) => d.valeur === true || (typeof d.valeur === 'number' && d.valeur > 0))
      .filter((d) => d.cle !== limite?.cle);
    charges.push({
      cle: a.cle,
      nom: a.nom,
      valeur: arrondiCharge(Number(fiche.valeur(a.cle)) || 0),
      ...(limite ? { limite } : {}),
      alertes,
    });
  }
  return { champs, charges };
}

// ─── Monnaies ────────────────────────────────────────────────────────────────

/** Monnaies des achats qui donnent des entrées de ces sortes (pièces, crédits) ; aucune sinon. */
export function monnaiesInventaire(fiche: Fiche, sortes: readonly string[]): SoldeMonnaie[] {
  const ids = new Set(
    [...fiche.systeme.achats.values()]
      .filter((a) => a.obtient.type === 'entree' && sortes.includes(a.obtient.sorte))
      .map((a) => a.monnaie),
  );
  return soldes(fiche).filter((s) => ids.has(s.monnaie.id));
}

// ─── Objets possédés ─────────────────────────────────────────────────────────

export interface Categorie {
  cle: string;
  nom: string;
  /** Ordre d'affichage : sorte dans le widget, puis option du champ (sinon alphabétique). */
  rang: number;
}

export interface InventoryItem {
  /** `entree#exemplaire` : unique dans l'inventaire. */
  cle: string;
  /** Nom affiché : nom propre de l'exemplaire (objet personnalisé), sinon celui de l'entrée. */
  nom: string;
  /** Description de l'exemplaire, sinon celle de l'entrée. */
  description?: string;
  entree: Entree;
  sorte: Sorte;
  effective: PossessionEffective;
  /** Possession explicite de l'état ; absente pour une entrée accordée par un effet ou un choix. */
  possession?: Possession;
  /** Numéro d'exemplaire affiché quand l'entrée en a plusieurs. */
  exemplaireLabel?: string;
  quantite: number;
  actif: boolean;
  categorie: Categorie;
  bonus: BonusLabel[];
  /** Poids ou encombrement unitaire, si le système en déclare un pour la sorte. */
  poids?: { champ: Champ; unitaire: number };
  /** Caché aux autres joueurs (seuls le propriétaire et le MJ le voient). */
  hidden: boolean;
  /** Dossier d'inventaire de l'exemplaire (connu de l'état). */
  folder?: InventoryFolder;
}

const AUTRES = '\u0000autres';
const SANS_RANG = 999;

/** Champ de regroupement d'une sorte : le premier des champs du widget qu'elle déclare. */
export function champGroupe(widget: InventoryWidget, sorte: Sorte): Champ | undefined {
  for (const id of champsGroupe(widget)) {
    const c = sorte.champs.find((x) => x.id === id);
    if (c) return c;
  }
  return undefined;
}

/** Nom lisible d'une valeur de champ (option d'un choix, attribut, entrée). */
export function nomValeurChamp(systeme: SystemeCharge, champ: Champ, v: string): string {
  switch (champ.type) {
    case 'choix':
      return champ.options.find((o) => o.valeur === v)?.nom ?? v;
    case 'entree':
      return systeme.entrees.get(v)?.nom ?? v;
    case 'attribut':
      return systeme.entites.get(champ.entite)?.attributs.get(v)?.nom ?? v;
    default:
      return v;
  }
}

/**
 * Catégorie d'une possession : la valeur de son champ de regroupement (celui de
 * l'exemplaire s'il en porte un : objet personnalisé), sinon sa sorte.
 */
export function categorieDe(
  fiche: Fiche,
  widget: InventoryWidget,
  entree: Entree,
  sorte: Sorte,
  possession?: Possession,
): Categorie {
  const base = Math.max(0, widget.sortes.indexOf(sorte.id)) * 1000;
  const champ = champGroupe(widget, sorte);
  if (!champ) return { cle: `sorte:${sorte.id}`, nom: sorte.nomPluriel ?? sorte.nom, rang: base };
  const v = champDe(entree, champ, possession);
  if (v === undefined || v === '' || Array.isArray(v))
    return { cle: AUTRES, nom: 'Autres', rang: Number.MAX_SAFE_INTEGER };
  if (typeof v === 'boolean')
    return {
      cle: `${champ.id}:${v}`,
      nom: v ? champ.nom : `Sans ${champ.nom.toLowerCase()}`,
      rang: base + (v ? 0 : 1),
    };
  const s = String(v);
  const option = champ.type === 'choix' ? champ.options.findIndex((o) => o.valeur === s) : -1;
  return {
    cle: `${champ.id}:${s}`,
    nom: nomValeurChamp(fiche.systeme, champ, s),
    rang: base + (option >= 0 ? option : SANS_RANG),
  };
}

export interface Inventory {
  items: InventoryItem[];
  /** Catégories présentes, dans l'ordre d'affichage (ordre des sortes ou alphabétique). */
  categories: Categorie[];
  charge: ChargeInventaire;
  monnaies: SoldeMonnaie[];
}

/** Inventaire d'une fiche : un objet par exemplaire possédé des sortes du widget. */
export function buildInventory(fiche: Fiche, widget: InventoryWidget, mj = false): Inventory {
  const charge = chargeInventaire(fiche, widget.sortes, mj);
  const items: InventoryItem[] = [];
  const dossier = (id: string | undefined) =>
    id === undefined ? undefined : fiche.etat.folders.find((f) => f.id === id);
  for (const p of fiche.possessions.values()) {
    if (!widget.sortes.includes(p.sorte.id) || !estEffective(p)) continue;
    const champPoids = charge.champs.get(p.sorte.id);
    const poids = (ex?: Possession) => {
      if (!champPoids) return undefined;
      const v = Number(champDe(p.entree, champPoids, ex));
      return Number.isFinite(v) && v !== 0 ? { champ: champPoids, unitaire: v } : undefined;
    };
    const plusieurs = p.exemplaires.length > 1;
    if (!p.exemplaires.length) {
      const pd = poids();
      items.push({
        cle: `${p.entree.id}#`,
        nom: p.entree.nom,
        ...(p.entree.description ? { description: p.entree.description } : {}),
        entree: p.entree,
        sorte: p.sorte,
        effective: p,
        quantite: 1,
        actif: p.actif,
        categorie: categorieDe(fiche, widget, p.entree, p.sorte),
        bonus: bonusDe(fiche, p.entree, p.sorte, p, undefined),
        ...(pd ? { poids: pd } : {}),
        hidden: false,
      });
      continue;
    }
    p.exemplaires.forEach((ex, i) => {
      const pd = poids(ex);
      const nom = nomPossession(p.entree, p.sorte, ex);
      const description = descriptionPossession(p.entree, p.sorte, ex);
      items.push({
        cle: `${p.entree.id}#${ex.exemplaire ?? ''}`,
        nom,
        ...(description ? { description } : {}),
        entree: p.entree,
        sorte: p.sorte,
        effective: p,
        possession: ex,
        // Un objet nommé se distingue par son nom, pas par son numéro
        ...(plusieurs && nom === p.entree.nom ? { exemplaireLabel: `n° ${i + 1}` } : {}),
        quantite: quantiteDe(ex),
        actif: p.sorte.activable ? ex.actif : true,
        categorie: categorieDe(fiche, widget, p.entree, p.sorte, ex),
        bonus: bonusDe(fiche, p.entree, p.sorte, p, ex),
        ...(pd ? { poids: pd } : {}),
        hidden: ex.hidden === true,
        ...(dossier(ex.folder) ? { folder: dossier(ex.folder)! } : {}),
      });
    });
  }

  const ordre = (a: Categorie, b: Categorie) => a.rang - b.rang || a.nom.localeCompare(b.nom, 'fr');
  items.sort(
    (a, b) =>
      ordre(a.categorie, b.categorie) ||
      a.nom.localeCompare(b.nom, 'fr') ||
      (a.possession?.exemplaire ?? '').localeCompare(b.possession?.exemplaire ?? '', 'fr', {
        numeric: true,
      }),
  );

  const categories: Categorie[] = [];
  for (const it of items)
    if (!categories.some((c) => c.cle === it.categorie.cle)) categories.push(it.categorie);
  categories.sort(ordre);

  return { items, categories, charge, monnaies: monnaiesInventaire(fiche, widget.sortes) };
}

/** Recherche insensible à la casse et aux accents. */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function correspond(
  item: { entree: Entree; nom?: string; description?: string; categorie?: Categorie },
  terme: string,
) {
  if (!terme) return true;
  const t = normaliser(terme);
  return (
    normaliser(item.nom ?? item.entree.nom).includes(t) ||
    normaliser(item.categorie?.nom ?? '').includes(t) ||
    normaliser(item.description ?? item.entree.description ?? '').includes(t)
  );
}

// ─── Champs lisibles ─────────────────────────────────────────────────────────

export interface ChampAffiche {
  champ: Champ;
  valeur: string;
  /** Valeur propre à l'exemplaire (différente de celle du catalogue). */
  propre: boolean;
  /** Modifiable sur l'exemplaire (nombre, texte, booléen, choix). */
  modifiable: boolean;
  /**
   * Champ qui nomme ou décrit l'exemplaire (`nomExemplaire`, `descriptionExemplaire` de la
   * sorte) : montré en titre et en description, listé seulement en personnalisation.
   */
  identite: boolean;
  brut: ValeurChamp | undefined;
}

/** Champs d'une entrée pour une possession : valeurs propres de l'exemplaire comprises. */
export function champsAffiches(
  fiche: Fiche,
  entree: Entree,
  sorte: Sorte,
  possession?: Possession,
): ChampAffiche[] {
  const r: ChampAffiche[] = [];
  // Champs d'une règle optionnelle éteinte (poids sans encombrement) : cachés, valeurs gardées
  for (const c of champsActifs(sorte, fiche.options)) {
    const v = champDe(entree, c, possession);
    const propre = possession?.champs[c.id] !== undefined;
    const modifiable =
      c.type === 'nombre' || c.type === 'texte' || c.type === 'booleen' || c.type === 'choix';
    const identite = c.id === sorte.nomExemplaire || c.id === sorte.descriptionExemplaire;
    let valeur: string | null;
    if (Array.isArray(v))
      valeur = v.map((id) => fiche.systeme.entrees.get(id)?.nom ?? id).join(', ') || null;
    else if (v === undefined || v === '') valeur = null;
    else if (c.type === 'entree' || c.type === 'attribut' || c.type === 'choix')
      valeur = nomValeurChamp(fiche.systeme, c, String(v));
    else if (c.type === 'formule') {
      // Formule lisible (« 1d8+FOR »), et son aperçu pour ce personnage s'il en diffère
      const f = formuleChamp(fiche.systeme, entree, c, possession, fiche.entite.type.id);
      if (f) {
        const vars = variablesObjet(
          entree,
          sorte,
          { rang: 0, actif: true, quantite: possession ? quantiteDe(possession) : 1 },
          possession,
        );
        const lisible = formuleLisible(fiche.systeme, fiche.entite.type.id, f.noeud, vars);
        const apercu = apercuFormule(fiche, f, vars);
        valeur = apercu !== lisible ? `${lisible} (${apercu})` : lisible;
      } else valeur = String(v);
    } else if (typeof v === 'boolean') valeur = v ? 'oui' : 'non';
    else valeur = String(v);
    // Booléen faux et nombre nul du catalogue : sans intérêt, sauf valeur propre
    const vide =
      valeur === null ||
      (!propre && ((c.type === 'booleen' && v === false) || (c.type === 'nombre' && v === 0)));
    if (vide && !modifiable) continue;
    r.push({
      champ: c,
      // Vide : masqué hors personnalisation
      valeur: vide ? '—' : (valeur ?? '—'),
      propre,
      modifiable,
      identite,
      brut: Array.isArray(v) ? undefined : v,
    });
  }
  return r;
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

export interface CatalogueEntry {
  entree: Entree;
  sorte: Sorte;
  categorie: Categorie;
  /** Exemplaires (et unités) déjà possédés. */
  possede: number;
  /** Ajout libre : pourquoi il est impossible (déjà possédé, maximum atteint). */
  bloque?: string;
  /** Prérequis de l'entrée non remplis (ajout libre possible, à la main du MJ). */
  exigeNonRempli: boolean;
  /** Achat du système qui donne l'entrée (coût, monnaie, blocages). */
  achat?: ObjetAchetable;
}

/** Entrées du catalogue des sortes du widget, avec ce que donnerait leur ajout ou leur achat. */
export function buildCatalogue(fiche: Fiche, widget: InventoryWidget): CatalogueEntry[] {
  const { systeme, etat } = fiche;
  const achats = new Map<string, ObjetAchetable>();
  for (const d of achatsPossibles(fiche)) {
    if (d.achat.obtient.type !== 'entree' || !widget.sortes.includes(d.achat.obtient.sorte))
      continue;
    for (const o of d.objets) if (!achats.has(o.objet)) achats.set(o.objet, o);
  }
  const parSorte = new Map<string, number>();
  for (const p of etat.possessions) {
    const s = systeme.entrees.get(p.entree)?.sorte;
    if (s) parSorte.set(s, (parSorte.get(s) ?? 0) + 1);
  }
  const r: CatalogueEntry[] = [];
  for (const entree of systeme.entrees.values()) {
    // Entrée générique d'objets hors catalogue : proposée par l'ajout d'un objet personnalisé
    if (!widget.sortes.includes(entree.sorte) || entree.libre) continue;
    const sorte = systeme.sortes.get(entree.sorte);
    if (!sorte?.pour.includes(etat.type)) continue;
    const siens = etat.possessions.filter((p) => p.entree === entree.id);
    const possede = siens.reduce((n, p) => n + quantiteDe(p), 0);
    let bloque: string | undefined;
    const ajouteUnite = sorte.quantites && siens.length > 0;
    if (siens.length && !sorte.exemplaires && !sorte.quantites) bloque = 'Déjà possédé';
    else if (
      !ajouteUnite &&
      sorte.maximum !== undefined &&
      (parSorte.get(sorte.id) ?? 0) >= sorte.maximum
    )
      bloque = `Maximum de ${sorte.maximum} atteint`;
    const exige = systeme.formules.get(chemins.exige(entree.id));
    const ok = exige ? essayer(fiche, exige) : undefined;
    const achat = achats.get(entree.id);
    r.push({
      entree,
      sorte,
      categorie: categorieDe(fiche, widget, entree, sorte),
      possede,
      ...(bloque ? { bloque } : {}),
      exigeNonRempli: Boolean(ok && !(ok.ok && ok.valeur === true)),
      ...(achat ? { achat } : {}),
    });
  }
  return r.sort(
    (a, b) =>
      widget.sortes.indexOf(a.sorte.id) - widget.sortes.indexOf(b.sorte.id) ||
      a.entree.nom.localeCompare(b.entree.nom, 'fr'),
  );
}

// ─── Objets personnalisés (hors catalogue) ───────────────────────────────────

export interface ModeleLibre {
  entree: Entree;
  sorte: Sorte;
  /** Champ de catégorie proposé à la saisie, et ses valeurs possibles. */
  categorie?: { champ: Champ; options: { valeur: string; nom: string }[]; defaut?: string };
}

/**
 * Valeurs proposées pour la catégorie d'un objet personnalisé : les options d'un champ
 * `choix`, sinon les valeurs que le catalogue de la sorte emploie (Contact, Distance…).
 */
function optionsCategorie(
  systeme: SystemeCharge,
  sorte: Sorte,
  champ: Champ,
): { valeur: string; nom: string }[] {
  if (champ.type === 'choix') return champ.options;
  if (champ.type !== 'texte' && champ.type !== 'attribut' && champ.type !== 'entree') return [];
  const vus = new Set<string>();
  for (const e of systeme.entrees.values()) {
    const v = e.sorte === sorte.id ? e.champs[champ.id] : undefined;
    if (typeof v === 'string' && v) vus.add(v);
  }
  return [...vus]
    .map((v) => ({ valeur: v, nom: nomValeurChamp(systeme, champ, v) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * Objets personnalisés possibles dans ce widget : entrées `libre` de ses sortes (une par
 * sorte au plus), avec le champ de catégorie à saisir (celui du regroupement du widget,
 * sinon le premier champ `choix` de la sorte).
 */
export function modelesLibres(fiche: Fiche, widget: InventoryWidget): ModeleLibre[] {
  const { systeme } = fiche;
  const r: ModeleLibre[] = [];
  for (const id of widget.sortes) {
    const sorte = systeme.sortes.get(id);
    if (!sorte?.pour.includes(fiche.etat.type) || !sorte.nomExemplaire) continue;
    const entree = [...systeme.entrees.values()].find((e) => e.sorte === id && e.libre);
    if (entree) r.push(modeleDe(fiche, widget, entree, sorte));
  }
  return r;
}

/**
 * Modèle d'ajout d'une entrée (catalogue ou objet personnalisé) : son champ de catégorie
 * (celui du regroupement du widget, sinon le premier `choix` de la sorte) et ses valeurs.
 */
export function modeleDe(
  fiche: Fiche,
  widget: InventoryWidget,
  entree: Entree,
  sorte: Sorte,
): ModeleLibre {
  const champ = champGroupe(widget, sorte) ?? sorte.champs.find((c) => c.type === 'choix');
  const options = champ ? optionsCategorie(fiche.systeme, sorte, champ) : [];
  const defaut = champ ? champDe(entree, champ) : undefined;
  return {
    entree,
    sorte,
    ...(champ && options.length
      ? {
          categorie: {
            champ,
            options,
            ...(typeof defaut === 'string' && defaut ? { defaut } : {}),
          },
        }
      : {}),
  };
}

/** Objet configuré avant son ajout (catalogue ou objet personnalisé). */
export interface SaisieLibre {
  /** Nom affiché ; nom propre de l'exemplaire s'il diffère de celui de l'entrée. */
  nom: string;
  quantite: number;
  categorie?: string;
  description?: string;
  /** Autres valeurs propres (champs de la sorte ; formules en clés nues : `1d6-CON+8`). */
  champs?: Record<string, ValeurChamp>;
  /** Bonus propres de l'exemplaire. */
  effets?: Effet[];
  /** Équipé (sorte activable) ; absent : équipé, comme le service. */
  actif?: boolean;
  /** Caché aux autres joueurs. */
  hidden?: boolean;
  /** Dossier choisi ; null : à la racine ; absent : le dossier affiché. */
  folder?: string | null;
  /** Sorte en quantités déjà possédée : unités ajoutées au dernier exemplaire. */
  empiler?: boolean;
}

/**
 * Ce que permet l'ajout d'une entrée : des unités de plus sur l'exemplaire possédé (sorte
 * en quantités), et/ou un nouvel exemplaire (non possédée, ou sorte `exemplaires`, sous le
 * maximum de la sorte). Même règle que `poserPossession` côté service.
 */
export function modesAjout(
  fiche: Fiche,
  entree: Entree,
  sorte: Sorte,
): { empiler: boolean; nouveau: boolean } {
  const { systeme, etat } = fiche;
  const possede = etat.possessions.some((p) => p.entree === entree.id);
  const deLaSorte = etat.possessions.filter(
    (p) => systeme.entrees.get(p.entree)?.sorte === sorte.id,
  ).length;
  const plein = sorte.maximum !== undefined && deLaSorte >= sorte.maximum;
  return {
    empiler: sorte.quantites && possede,
    nouveau: (!possede || sorte.exemplaires) && !plein,
  };
}

/** Dernier exemplaire possédé d'une entrée, auquel s'ajoutent des unités. */
export function pileDe(etat: EtatEntite, entree: string): Possession | undefined {
  return etat.possessions.findLast((p) => p.entree === entree);
}

/**
 * Ajout d'un objet configuré, en une seule demande : un nouvel exemplaire avec ses valeurs
 * propres (nom, description, catégorie, champs, formules), ses bonus, sa quantité, son
 * état équipé, sa visibilité et son dossier. Seul ce qui diffère de l'entrée est envoyé.
 * `empiler` : des unités de plus sur l'exemplaire déjà possédé.
 */
export function ajouterLibre(etat: EtatEntite, modele: ModeleLibre, saisie: SaisieLibre): Ecriture {
  const { entree, sorte } = modele;
  const pile = saisie.empiler && sorte.quantites ? pileDe(etat, entree.id) : undefined;
  if (pile) {
    const quantite = quantiteDe(pile) + Math.max(1, Math.floor(saisie.quantite));
    return {
      demande: {
        entree: entree.id,
        ...(pile.exemplaire !== undefined ? { exemplaire: pile.exemplaire } : {}),
        quantite,
      },
      apercu: avecPossessions(
        etat,
        etat.possessions.map((p) => (p === pile ? { ...p, quantite } : p)),
      ),
    };
  }

  const champs: Record<string, ValeurChamp> = { ...saisie.champs };
  const nom = saisie.nom.trim();
  if (sorte.nomExemplaire && nom && nom !== entree.nom) champs[sorte.nomExemplaire] = nom;
  const description = saisie.description?.trim() ?? '';
  if (sorte.descriptionExemplaire && description && description !== entree.description?.trim())
    champs[sorte.descriptionExemplaire] = description;
  if (
    saisie.categorie &&
    modele.categorie &&
    saisie.categorie !== champDe(entree, modele.categorie.champ)
  )
    champs[modele.categorie.champ.id] = saisie.categorie;
  const quantite = sorte.quantites && saisie.quantite > 1 ? saisie.quantite : undefined;
  const effets = saisie.effets?.length ? saisie.effets : undefined;
  const deja = etat.possessions.some((p) => p.entree === entree.id);
  const exemplaire = deja ? nouvelExemplaire(etat.possessions, entree.id) : undefined;
  const reglages = {
    ...(Object.keys(champs).length ? { champs } : {}),
    ...(quantite !== undefined ? { quantite } : {}),
    ...(effets ? { effets } : {}),
    ...(sorte.activable && saisie.actif === false ? { actif: false } : {}),
    ...(saisie.hidden ? { hidden: true } : {}),
  };
  const folder =
    saisie.folder === null || etat.folders.some((f) => f.id === saisie.folder)
      ? saisie.folder
      : undefined;
  return {
    demande: {
      entree: entree.id,
      nouveau: true,
      ...reglages,
      ...(folder !== undefined ? { folder } : {}),
    },
    apercu: avecPossessions(etat, [
      ...etat.possessions,
      nouvellePossession(entree.id, 0, {
        ...reglages,
        ...(exemplaire !== undefined ? { exemplaire } : {}),
        ...(folder ? { folder } : {}),
      }),
    ]),
  };
}

// ─── Écritures : demande et aperçu ───────────────────────────────────────────

export interface Ecriture {
  demande: InventoryRequest;
  apercu: EtatEntite;
}

function avecPossessions(etat: EtatEntite, possessions: Possession[]): EtatEntite {
  return { ...etat, possessions };
}

/** Ajout libre depuis le catalogue : une unité de plus (sorte `quantites`), sinon un exemplaire. */
export function ajouter(systeme: SystemeCharge, etat: EtatEntite, entreeId: string): Ecriture {
  const sorte = systeme.sortes.get(systeme.entrees.get(entreeId)?.sorte ?? '');
  const siens = etat.possessions.filter((p) => p.entree === entreeId);
  const derniere = siens[siens.length - 1];
  if (sorte?.quantites && derniere) {
    const quantite = quantiteDe(derniere) + 1;
    return {
      demande: {
        entree: entreeId,
        ...(derniere.exemplaire !== undefined ? { exemplaire: derniere.exemplaire } : {}),
        quantite,
      },
      apercu: avecPossessions(
        etat,
        etat.possessions.map((p) => (p === derniere ? { ...p, quantite } : p)),
      ),
    };
  }
  return nouvelExemplaireDe(etat, entreeId);
}

/**
 * Un exemplaire distinct de plus (sorte `exemplaires`), ou la première possession. `champs` :
 * valeurs propres reprises (nom et catégorie d'un objet personnalisé).
 */
export function nouvelExemplaireDe(
  etat: EtatEntite,
  entreeId: string,
  champs?: Record<string, ValeurChamp>,
): Ecriture {
  const deja = etat.possessions.some((p) => p.entree === entreeId);
  const exemplaire = deja ? nouvelExemplaire(etat.possessions, entreeId) : undefined;
  const propres = champs && Object.keys(champs).length ? { champs } : {};
  return {
    demande: { entree: entreeId, nouveau: true, ...propres },
    apercu: avecPossessions(etat, [
      ...etat.possessions,
      nouvellePossession(entreeId, 0, {
        ...(exemplaire !== undefined ? { exemplaire } : {}),
        ...propres,
      }),
    ]),
  };
}

function viser(item: InventoryItem): Pick<InventoryRequest, 'entree' | 'exemplaire'> {
  const ex = item.possession?.exemplaire;
  return { entree: item.entree.id, ...(ex !== undefined ? { exemplaire: ex } : {}) };
}

function modifier(etat: EtatEntite, item: InventoryItem, patch: Partial<Possession>): EtatEntite {
  const ex = item.possession?.exemplaire;
  const existe = etat.possessions.some((p) => estExemplaire(p, item.entree.id, ex));
  return avecPossessions(
    etat,
    existe
      ? etat.possessions.map((p) => (estExemplaire(p, item.entree.id, ex) ? { ...p, ...patch } : p))
      : [...etat.possessions, nouvellePossession(item.entree.id, 0, patch)],
  );
}

export function changerQuantite(etat: EtatEntite, item: InventoryItem, quantite: number): Ecriture {
  return { demande: { ...viser(item), quantite }, apercu: modifier(etat, item, { quantite }) };
}

/** Équipe ou range : une entrée accordée sans possession en reçoit une (comme BlocPossessions). */
export function basculerActif(etat: EtatEntite, item: InventoryItem, actif: boolean): Ecriture {
  return { demande: { ...viser(item), actif }, apercu: modifier(etat, item, { actif }) };
}

export function changerChamps(
  etat: EtatEntite,
  item: InventoryItem,
  champs: Record<string, ValeurChamp>,
): Ecriture {
  return {
    demande: { ...viser(item), champs },
    apercu: modifier(etat, item, { champs: { ...item.possession?.champs, ...champs } }),
  };
}

export interface Retrait {
  entree: string;
  exemplaire?: string;
  apercu: EtatEntite;
}

export function retirer(etat: EtatEntite, item: InventoryItem): Retrait {
  const ex = item.possession?.exemplaire;
  return {
    ...viser(item),
    apercu: avecPossessions(
      etat,
      etat.possessions.filter((p) => !estExemplaire(p, item.entree.id, ex)),
    ),
  };
}

// ─── Sortes d'inventaire par défaut ──────────────────────────────────────────

/**
 * Sortes qui ressemblent à de l'équipement pour un type d'entité : sans rangs, sans
 * maximum, équipables ou multiples, et qu'un achat du système donne. Suggestion pour
 * créer un bloc Inventaire ; la présentation du système reste la référence.
 */
export function sortesInventaireParDefaut(systeme: SystemeCharge, type: string): string[] {
  const achetables = new Set(
    [...systeme.achats.values()].flatMap((a) =>
      a.obtient.type === 'entree' ? [a.obtient.sorte] : [],
    ),
  );
  return [...systeme.sortes.values()]
    .filter(
      (s) =>
        s.pour.includes(type) &&
        !s.rangs &&
        s.maximum === undefined &&
        (s.activable || s.exemplaires || s.quantites) &&
        achetables.has(s.id),
    )
    .map((s) => s.id);
}

// ─── Formules des objets (dés d'une arme…) ───────────────────────────────────

export interface FormuleAffichee {
  champ: Champ;
  /**
   * Formule en vigueur, lisible : celle de l'exemplaire telle que saisie (`1d6-CON+8`), sinon
   * celle de l'entrée réécrite comme on la saisit (`des(source.nbDes, source.faces)` → `1d8`).
   */
  texte: string;
  /** L'exemplaire a sa propre formule. */
  propre: boolean;
  /** Formule de jet : peut lancer des dés (tirés par l'action qui la lit). */
  des: boolean;
  /** Aperçu pour ce personnage : attributs et champs calculés, dés écrits (« 1d6 − 2 + 8 »). */
  apercu: string;
}

export type ChampFormule = Extract<Champ, { type: 'formule' }>;

/** État d'un objet lu par ses formules : `rang`, `actif`, `quantite`, `source.<champ>`. */
export interface ObjetFormules {
  entree: Entree;
  sorte: Sorte;
  rang: number;
  actif: boolean;
  quantite: number;
  /** Valeurs propres de l'exemplaire (possédé, ou en cours de configuration). */
  champs?: Possession['champs'];
}

function variablesDe(o: ObjetFormules) {
  return variablesObjet(
    o.entree,
    o.sorte,
    { rang: o.rang, actif: o.actif, quantite: o.quantite },
    o.champs ? { champs: o.champs } : undefined,
  );
}

function objetDe(item: InventoryItem): ObjetFormules {
  return {
    entree: item.entree,
    sorte: item.sorte,
    rang: item.effective.rang,
    actif: item.actif,
    quantite: item.quantite,
    ...(item.possession ? { champs: item.possession.champs } : {}),
  };
}

/**
 * Formules d'un objet (champs `formule` de sa sorte), lisibles et avec leur aperçu : celles
 * de l'exemplaire si ses valeurs propres en portent une, sinon celles de l'entrée.
 */
export function formulesObjet(fiche: Fiche, o: ObjetFormules): FormuleAffichee[] {
  const entite = fiche.entite.type.id;
  const vars = variablesDe(o);
  const r: FormuleAffichee[] = [];
  for (const champ of o.sorte.champs) {
    if (champ.type !== 'formule') continue;
    const ex = o.champs ? { champs: o.champs } : undefined;
    const f = formuleChamp(fiche.systeme, o.entree, champ, ex, entite);
    if (!f) continue;
    const brut = o.champs?.[champ.id];
    const saisie = typeof brut === 'string' || typeof brut === 'number' ? String(brut).trim() : '';
    // Formule propre valide : telle que saisie ; sinon celle de l'entrée, réécrite
    const propre =
      saisie !== '' && compilerFormuleChamp(fiche.systeme, o.sorte, champ, saisie, entite).ok;
    r.push({
      champ,
      texte: propre ? saisie : formuleLisible(fiche.systeme, entite, f.noeud, vars),
      propre,
      des: champ.des === true,
      apercu: apercuFormule(fiche, f, vars),
    });
  }
  return r;
}

/** Formules d'un objet possédé (voir `formulesObjet`). */
export function formulesDe(fiche: Fiche, item: InventoryItem): FormuleAffichee[] {
  return formulesObjet(fiche, objetDe(item));
}

export type FormuleVerifiee =
  { ok: true; texte: string; apercu: string } | { ok: false; erreurs: string[] };

/**
 * Vérifie une formule saisie en clés nues (`1d6-CON+8`) pour un champ de l'objet, comme le
 * fera le service : `normaliserFormuleJet` pour le type d'entité du personnage, puis
 * compilation ; aperçu calculé pour ce personnage.
 */
export function verifierFormuleObjet(
  fiche: Fiche,
  o: ObjetFormules,
  champ: ChampFormule,
  texte: string,
): FormuleVerifiee {
  const r = compilerFormuleChamp(fiche.systeme, o.sorte, champ, texte, fiche.entite.type.id);
  if (!r.ok) return r;
  return { ok: true, texte: r.texte, apercu: apercuFormule(fiche, r.formule, variablesDe(o)) };
}

/** Vérifie une formule saisie pour un champ d'un objet possédé. */
export function verifierFormule(
  fiche: Fiche,
  item: InventoryItem,
  champ: ChampFormule,
  texte: string,
): FormuleVerifiee {
  return verifierFormuleObjet(fiche, objetDe(item), champ, texte);
}

/**
 * Méta courte d'un objet pour sa ligne : dés de ses formules de jet (« 1d8 »), sinon
 * valeur d'une formule non nulle ; les calculs viennent du système, aucun champ nommé.
 */
export function metaFormule(fiche: Fiche, item: InventoryItem): string | null {
  const fs = formulesDe(fiche, item);
  const jet = fs.find((f) => f.des);
  if (jet) return jet.apercu;
  const autre = fs.find((f) => f.apercu !== '0' && f.apercu !== '');
  return autre ? `${autre.champ.nom} ${autre.apercu}` : null;
}

// ─── Bonus propres d'un exemplaire ───────────────────────────────────────────

/** Condition d'un effet propre désactivé (l'effet reste, sans s'appliquer). */
export const EFFET_DESACTIVE = 'faux';

export interface BonusPropre {
  index: number;
  effet: Effet;
  texte: string;
  actif: boolean;
}

/** Effets propres de l'exemplaire (bonus saisis sur l'objet), avec leur état. */
export function bonusPropres(fiche: Fiche, item: InventoryItem): BonusPropre[] {
  return bonusDesEffets(fiche, item.possession?.effets ?? []);
}

/** Bonus propres d'une liste d'effets (exemplaire possédé, ou objet en configuration). */
export function bonusDesEffets(fiche: Fiche, effets: readonly Effet[]): BonusPropre[] {
  return effets.map((effet, index) => {
    const brut = effet.sur === 'attribut' ? Number(effet.valeur) : Number.NaN;
    const texte =
      libelleEffet(fiche, effet, (champ) =>
        champ === 'valeur' && Number.isFinite(brut) ? brut : undefined,
      ) ?? 'Effet';
    return { index, effet, texte, actif: effet.condition !== EFFET_DESACTIVE };
  });
}

/**
 * Clé d'attribut prise en exemple dans l'aide des formules : le premier attribut jetable du
 * système, sinon le premier attribut de base.
 */
export function cleExemple(fiche: Fiche): string {
  const jetable = declarationsJetables(fiche.systeme, fiche.entite.type.id)[0];
  if (jetable) return jetable.cle;
  const base = [...fiche.entite.attributs.values()].find((a) => a.nature === 'base');
  return base?.cle ?? 'X';
}

export function basculerBonus(item: InventoryItem, index: number): Effet[] {
  return basculerBonusDans(item.possession?.effets ?? [], index);
}

/** Active ou désactive le bonus `index` d'une liste d'effets. */
export function basculerBonusDans(effets: readonly Effet[], index: number): Effet[] {
  return effets.map((e, i) => {
    if (i !== index) return e;
    if (e.condition === EFFET_DESACTIVE) {
      const { condition: _, ...reste } = e;
      return reste as Effet;
    }
    return { ...e, condition: EFFET_DESACTIVE };
  });
}

export function sansBonus(item: InventoryItem, index: number): Effet[] {
  return (item.possession?.effets ?? []).filter((_, i) => i !== index);
}

// ─── Autres écritures de l'inventaire ────────────────────────────────────────

/**
 * Effets propres de l'exemplaire (remplacent les précédents) ; les effets coupés suivent
 * leur effet, comme le fait le service.
 */
export function poserEffets(etat: EtatEntite, item: InventoryItem, effets: Effet[]): Ecriture {
  const apercu = modifier(etat, item, { effets });
  const avant = item.possession;
  return {
    demande: { ...viser(item), effets },
    apercu: avant
      ? {
          ...apercu,
          effetsDesactives: reporterEffetsDesactives(
            etat.effetsDesactives,
            sourceExemplaire(avant),
            avant.effets,
            effets,
          ),
        }
      : apercu,
  };
}

/** Range l'exemplaire dans un dossier (null : à la racine). */
export function ranger(etat: EtatEntite, item: InventoryItem, folder: string | null): Ecriture {
  const apercu = avecPossessions(
    etat,
    etat.possessions.map((p) => {
      if (!estExemplaire(p, item.entree.id, item.possession?.exemplaire)) return p;
      const { folder: _, ...reste } = p;
      return folder === null ? reste : { ...reste, folder };
    }),
  );
  return { demande: { ...viser(item), folder }, apercu };
}

/** Cache l'exemplaire aux autres joueurs, ou le rend visible. */
export function cacher(etat: EtatEntite, item: InventoryItem, hidden: boolean): Ecriture {
  const apercu = avecPossessions(
    etat,
    etat.possessions.map((p) => {
      if (!estExemplaire(p, item.entree.id, item.possession?.exemplaire)) return p;
      const { hidden: _, ...reste } = p;
      return hidden ? { ...reste, hidden: true } : reste;
    }),
  );
  return { demande: { ...viser(item), hidden }, apercu };
}

/** Champ qui nomme l'exemplaire (renommage), si la sorte en déclare un. */
export function renommable(item: InventoryItem): boolean {
  return Boolean(item.possession && item.sorte.nomExemplaire);
}

export function renommer(etat: EtatEntite, item: InventoryItem, nom: string): Ecriture {
  // Le nom de l'entrée : retour au nom du catalogue
  const valeur = nom.trim() === item.entree.nom ? '' : nom.trim();
  return changerChamps(etat, item, { [item.sorte.nomExemplaire!]: valeur });
}

/** Une unité de moins (consommée), ou l'exemplaire retiré s'il n'en reste qu'une. */
export function consommer(
  etat: EtatEntite,
  item: InventoryItem,
): { type: 'quantite'; ecriture: Ecriture } | { type: 'retrait'; retrait: Retrait } {
  return item.quantite > 1
    ? { type: 'quantite', ecriture: changerQuantite(etat, item, item.quantite - 1) }
    : { type: 'retrait', retrait: retirer(etat, item) };
}

/** Aperçu du donneur après un don de `quantite` unités (tout l'exemplaire au-delà). */
export function apresDon(etat: EtatEntite, item: InventoryItem, quantite: number): EtatEntite {
  if (quantite < item.quantite) return changerQuantite(etat, item, item.quantite - quantite).apercu;
  return retirer(etat, item).apercu;
}

/** Remet un exemplaire retiré tel qu'il était (annulation d'une suppression). */
export function restaurer(etat: EtatEntite, p: Possession): Ecriture {
  return {
    demande: {
      entree: p.entree,
      nouveau: true,
      ...(p.exemplaire !== undefined ? { exemplaire: p.exemplaire } : {}),
      ...(p.quantite !== undefined ? { quantite: p.quantite } : {}),
      ...(p.rang ? { rang: p.rang } : {}),
      actif: p.actif,
      choix: p.choix,
      champs: p.champs,
      effets: p.effets,
      ...(p.hidden ? { hidden: true } : {}),
      ...(p.folder !== undefined && etat.folders.some((f) => f.id === p.folder)
        ? { folder: p.folder }
        : {}),
    },
    apercu: avecPossessions(etat, [...etat.possessions, p]),
  };
}

/** Dossiers : nouvel ordre, noms, ajouts (sans identifiant) et suppressions. */
export function apercuDossiers(
  etat: EtatEntite,
  folders: { id?: string; name: string }[],
): EtatEntite {
  const ids = new Set(folders.flatMap((f) => (f.id ? [f.id] : [])));
  return {
    ...etat,
    folders: folders.map((f, i) => ({ id: f.id ?? `nouveau-${i}`, name: f.name })),
    possessions: etat.possessions.map((p) => {
      if (p.folder === undefined || ids.has(p.folder)) return p;
      const { folder: _, ...reste } = p;
      return reste;
    }),
  };
}

// ─── Tri de la grille ────────────────────────────────────────────────────────

export type Tri = 'nom' | 'quantite' | 'poids' | 'equipe';

export const TRIS: { cle: Tri; nom: string }[] = [
  { cle: 'nom', nom: 'Nom' },
  { cle: 'quantite', nom: 'Quantité' },
  { cle: 'poids', nom: 'Poids' },
  { cle: 'equipe', nom: 'Équipés d’abord' },
];

export function trier(items: InventoryItem[], tri: Tri): InventoryItem[] {
  const parNom = (a: InventoryItem, b: InventoryItem) => a.nom.localeCompare(b.nom, 'fr');
  const poids = (i: InventoryItem) => (i.poids ? i.poids.unitaire * i.quantite : 0);
  const cmp: Record<Tri, (a: InventoryItem, b: InventoryItem) => number> = {
    nom: parNom,
    quantite: (a, b) => b.quantite - a.quantite || parNom(a, b),
    poids: (a, b) => poids(b) - poids(a) || parNom(a, b),
    equipe: (a, b) =>
      Number(b.sorte.activable && b.actif) - Number(a.sorte.activable && a.actif) || parNom(a, b),
  };
  return [...items].sort(cmp[tri]);
}

/**
 * Nouvel exemplaire créé dans un dossier (ajout depuis un dossier ouvert) ; une écriture
 * qui ne crée rien (unité de plus sur un exemplaire existant) ou dont le dossier est déjà
 * choisi reste telle quelle.
 */
export function dansDossier(w: Ecriture, folder: string | null): Ecriture {
  // Dossier déjà choisi à la configuration (racine comprise) : il l'emporte
  if (!folder || !w.demande.nouveau || w.demande.folder !== undefined) return w;
  const possessions = [...w.apercu.possessions];
  const derniere = possessions.at(-1);
  if (derniere) possessions[possessions.length - 1] = { ...derniere, folder };
  return { demande: { ...w.demande, folder }, apercu: { ...w.apercu, possessions } };
}
