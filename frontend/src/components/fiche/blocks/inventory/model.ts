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
  chemins,
  essayer,
  estEffective,
  estExemplaire,
  nouvelExemplaire,
  nouvellePossession,
  quantiteDe,
  soldes,
  sourceExemplaire,
  type Champ,
  type Effet,
  type Entree,
  type EtatEntite,
  type Fiche,
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
  actif?: boolean;
  champs?: Record<string, ValeurChamp>;
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
      return v ?? (def?.type === 'booleen' ? false : def?.type === 'nombre' ? 0 : '');
    }
    throw new Error(`Variable inconnue : ${nom}`);
  };
}

function nomAttribut(fiche: Fiche, cle: string): string {
  const a = fiche.entite.attributs.get(cle);
  return a?.abrege ?? a?.nom ?? cle;
}

function nomDe(systeme: SystemeCharge, id: string): string {
  return systeme.source.des?.sortes.find((d) => d.id === id)?.nom ?? id;
}

/** Libellé d'un effet d'entrée ou d'exemplaire, valeurs évaluées quand c'est possible. */
function libelleEffet(
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
      const cible = e.implique?.entree
        ? fiche.systeme.entrees.get(e.implique.entree)?.nom
        : e.implique?.attribut
          ? nomAttribut(fiche, e.implique.attribut)
          : e.actions?.length === 1
            ? fiche.systeme.actions.get(e.actions[0]!)?.nom
            : undefined;
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
      fiche.valeurs.get(e.attribut)?.detail.some((l) => l.source === source && l.ignore === true),
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
 * Agrégat du moteur qui additionne un champ des objets portés d'une sorte :
 * `somme_actifs("sorte", "champ")`. `somme` (tout ce qui est possédé) n'est pas une charge :
 * total d'Obligation, dé de vie…
 */
const AGREGAT_CHARGE = 'somme_actifs';

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
 * (`somme_actifs`) un champ numérique des objets portés d'une sorte équipable de
 * l'inventaire. Aucun nom de champ supposé : c'est la formule du système qui désigne le poids.
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
  const visible = (a: { visibilite: string }) => mj || a.visibilite !== 'mj';

  for (const a of entite.attributs.values()) {
    if (a.nature !== 'derivee' || a.type !== 'nombre' || !visible(a)) continue;
    const f = formule(a.cle);
    if (!f) continue;
    let lit = false;
    parcourir(f.noeud, (n) => {
      if (n.t !== 'appel' || n.fn !== AGREGAT_CHARGE) return;
      const [s, c] = n.args;
      if (s?.t !== 'texte' || c?.t !== 'texte' || !sortes.includes(s.v)) return;
      const sorte = systeme.sortes.get(s.v);
      const champ = sorte?.champs.find((x) => x.id === c.v);
      if (!sorte?.activable || champ?.type !== 'nombre') return;
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
        if (typeof v === 'number' && !limite) limite = { cle, nom: l.nom, valeur: v };
      }
    }
    const alertes = dependants
      .map((d) => ({ cle: d.cle, nom: d.nom, valeur: fiche.valeur(d.cle) }))
      .filter((d) => d.valeur === true || (typeof d.valeur === 'number' && d.valeur > 0))
      .filter((d) => d.cle !== limite?.cle);
    charges.push({
      cle: a.cle,
      nom: a.nom,
      valeur: Number(fiche.valeur(a.cle)) || 0,
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
}

export interface InventoryItem {
  /** `entree#exemplaire` : unique dans l'inventaire. */
  cle: string;
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
}

const AUTRES = '\u0000autres';

/** Catégorie d'une entrée : sa sorte, ou la valeur du champ `groupeChamp` du widget. */
export function categorieDe(
  fiche: Fiche,
  widget: InventoryWidget,
  entree: Entree,
  sorte: Sorte,
): Categorie {
  if (!widget.groupeChamp) return { cle: sorte.id, nom: sorte.nomPluriel ?? sorte.nom };
  const champ = sorte.champs.find((c) => c.id === widget.groupeChamp);
  const v = champ ? champDe(entree, champ) : undefined;
  if (v === undefined || v === '' || Array.isArray(v)) return { cle: AUTRES, nom: 'Autres' };
  if (typeof v === 'boolean')
    return { cle: `${champ!.id}:${v}`, nom: v ? champ!.nom : `Sans ${champ!.nom.toLowerCase()}` };
  const s = String(v);
  if (champ?.type === 'entree') return { cle: s, nom: fiche.systeme.entrees.get(s)?.nom ?? s };
  if (champ?.type === 'attribut')
    return { cle: s, nom: fiche.systeme.entites.get(champ.entite)?.attributs.get(s)?.nom ?? s };
  return { cle: s, nom: s };
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
  for (const p of fiche.possessions.values()) {
    if (!widget.sortes.includes(p.sorte.id) || !estEffective(p)) continue;
    const categorie = categorieDe(fiche, widget, p.entree, p.sorte);
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
        entree: p.entree,
        sorte: p.sorte,
        effective: p,
        quantite: 1,
        actif: p.actif,
        categorie,
        bonus: bonusDe(fiche, p.entree, p.sorte, p, undefined),
        ...(pd ? { poids: pd } : {}),
      });
      continue;
    }
    p.exemplaires.forEach((ex, i) => {
      const pd = poids(ex);
      items.push({
        cle: `${p.entree.id}#${ex.exemplaire ?? ''}`,
        entree: p.entree,
        sorte: p.sorte,
        effective: p,
        possession: ex,
        ...(plusieurs ? { exemplaireLabel: `n° ${i + 1}` } : {}),
        quantite: quantiteDe(ex),
        actif: p.sorte.activable ? ex.actif : true,
        categorie,
        bonus: bonusDe(fiche, p.entree, p.sorte, p, ex),
        ...(pd ? { poids: pd } : {}),
      });
    });
  }

  const ordreSorte = (s: string) => widget.sortes.indexOf(s);
  items.sort(
    (a, b) =>
      (widget.groupeChamp ? 0 : ordreSorte(a.sorte.id) - ordreSorte(b.sorte.id)) ||
      a.categorie.nom.localeCompare(b.categorie.nom, 'fr') ||
      a.entree.nom.localeCompare(b.entree.nom, 'fr') ||
      (a.possession?.exemplaire ?? '').localeCompare(b.possession?.exemplaire ?? '', 'fr', {
        numeric: true,
      }),
  );

  const categories: Categorie[] = [];
  for (const it of items)
    if (!categories.some((c) => c.cle === it.categorie.cle)) categories.push(it.categorie);
  // Par sorte : ordre du widget ; par champ : alphabétique, « Autres » en dernier
  if (widget.groupeChamp)
    categories.sort(
      (a, b) =>
        Number(a.cle === AUTRES) - Number(b.cle === AUTRES) ||
        a.nom.localeCompare(b.nom, 'fr', { numeric: true }),
    );

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

export function correspond(item: { entree: Entree; categorie?: Categorie }, terme: string) {
  if (!terme) return true;
  const t = normaliser(terme);
  return (
    normaliser(item.entree.nom).includes(t) ||
    normaliser(item.categorie?.nom ?? '').includes(t) ||
    normaliser(item.entree.description ?? '').includes(t)
  );
}

// ─── Champs lisibles ─────────────────────────────────────────────────────────

export interface ChampAffiche {
  champ: Champ;
  valeur: string;
  /** Valeur propre à l'exemplaire (différente de celle du catalogue). */
  propre: boolean;
  /** Modifiable sur l'exemplaire (nombre, texte, booléen). */
  modifiable: boolean;
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
  for (const c of sorte.champs) {
    const v = champDe(entree, c, possession);
    const propre = possession?.champs[c.id] !== undefined;
    const modifiable = c.type === 'nombre' || c.type === 'texte' || c.type === 'booleen';
    let valeur: string | null = null;
    if (Array.isArray(v))
      valeur = v.map((id) => fiche.systeme.entrees.get(id)?.nom ?? id).join(', ') || null;
    else if (v === undefined || v === '') valeur = null;
    else if (c.type === 'entree') valeur = fiche.systeme.entrees.get(String(v))?.nom ?? String(v);
    else if (c.type === 'attribut')
      valeur = fiche.systeme.entites.get(c.entite)?.attributs.get(String(v))?.nom ?? String(v);
    else if (c.type === 'formule') {
      const f = fiche.systeme.formules.get(chemins.champ(entree.id, c.id));
      const res = f ? essayer(fiche, f) : undefined;
      valeur =
        res?.ok && String(res.valeur) !== String(v)
          ? `${String(v)} (${String(arrondi(res.valeur))})`
          : String(v);
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
    if (!widget.sortes.includes(entree.sorte)) continue;
    const sorte = systeme.sortes.get(entree.sorte);
    if (!sorte || !sorte.pour.includes(etat.type)) continue;
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

/** Un exemplaire distinct de plus (sorte `exemplaires`), ou la première possession. */
export function nouvelExemplaireDe(etat: EtatEntite, entreeId: string): Ecriture {
  const deja = etat.possessions.some((p) => p.entree === entreeId);
  const exemplaire = deja ? nouvelExemplaire(etat.possessions, entreeId) : undefined;
  return {
    demande: { entree: entreeId, nouveau: true },
    apercu: avecPossessions(etat, [
      ...etat.possessions,
      nouvellePossession(entreeId, 0, exemplaire !== undefined ? { exemplaire } : {}),
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
    apercu: modifier(etat, item, { champs: { ...(item.possession?.champs ?? {}), ...champs } }),
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
