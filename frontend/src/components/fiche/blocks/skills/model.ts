/**
 * Données du bloc Compétences en cartes, calculées par le moteur sans rien connaître du jeu :
 * entrées d'une sorte, état actif (sortes `activable`), bonus réellement appliqués (lignes
 * d'explication des valeurs dont la source est l'entrée), effets de jet (dés ajoutés,
 * améliorés…), filtres par la valeur d'un champ de la sorte, et progression (achats qui visent
 * la sorte, directement ou par une voie ou un arbre qui en accorde les entrées).
 */
import { compareText, translate } from '@/i18n/runtime';
import {
  achatsPossibles,
  usagesDe,
  type Effet,
  type Entree,
  type Fiche,
  type ObjetAchetable,
  type PossessionEffective,
  type Sorte,
  type SystemeCharge,
  type Usages,
  type Valeur,
} from '@vtt/rules';
import { texteEffet } from '@/lib/creation';
import { jetsVises } from '../effects/condition-text';
import { effetEstBonus, effetsDuPersonnage } from '../effects/model';
import { maxRank, pathSortes } from '../tree/model';

export interface BonusTag {
  label: string;
  /** Faux : effet décrit mais pas appliqué (entrée inactive, condition fausse). */
  applied: boolean;
}

export interface FilterValue {
  key: string;
  label: string;
}

export interface SkillCard {
  entry: Entree;
  possession?: PossessionEffective;
  rank: number;
  maxRank?: number;
  /** La sorte s'active (état `actif`) : pastille et bouton d'activation. */
  activable: boolean;
  active: boolean;
  bonuses: BonusTag[];
  /** Effets sur les jets (dés ajoutés, améliorés, retirés, bonus au jet). */
  rolls: string[];
  /**
   * Bonus de l'entrée (effets de son catalogue et de ses exemplaires) : combien, et combien
   * s'appliquent. La carte n'en montre qu'un indicateur ; ils se gèrent dans le bloc Bonus.
   */
  bonusCount: { total: number; active: number };
  /** Champs de l'entrée affichables (nom, valeur lisible). */
  fields: { name: string; value: string }[];
  filter?: FilterValue;
  /** Rang ou entrée à acheter directement (achat qui vise cette sorte). */
  offer?: ObjetAchetable;
  /** D'où vient la possession (voie, nœud, espèce…), noms lisibles. */
  origins: string[];
  /** Usages limités (« une fois par combat ») : utilisations restantes. */
  uses?: Usages;
}

export interface Progress {
  currency: string;
  currencyName: string;
  balance: number;
  /** Achats possibles maintenant avec ce solde. */
  possible: number;
  /** Les entrées s'obtiennent par une voie ou un arbre (le bloc Arbre les montre). */
  viaTree: boolean;
}

export interface SkillsData {
  sorte: Sorte;
  cards: SkillCard[];
  filters: (FilterValue & { count: number })[];
  /** Origine des filtres : un champ de la sorte, ou les étiquettes des entrées. */
  filterLabel?: string;
  progress: Progress[];
  /** Les rangs de la sorte s'achètent directement : tout le catalogue est listé (rang 0 compris). */
  rankPurchase: boolean;
}

function signed(v: Valeur): string {
  if (typeof v !== 'number') return String(v);
  const n = Number.isInteger(v) ? v : Math.round(v * 10) / 10;
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function attributeLabel(fiche: Fiche, key: string): string {
  const a = fiche.entite.attributs.get(key);
  return a?.abrege ?? a?.nom ?? key;
}

/** Valeur lisible d'un champ d'entrée : entrée ou attribut référencé par son nom. */
export function fieldValue(
  systeme: SystemeCharge,
  fiche: Fiche,
  sorte: Sorte,
  entry: Entree,
  fieldId: string,
): string | undefined {
  const champ = sorte.champs.find((c) => c.id === fieldId);
  if (!champ) return undefined;
  const raw = entry.champs[fieldId] ?? ('defaut' in champ ? champ.defaut : undefined);
  if (raw === undefined || raw === '') return undefined;
  if (Array.isArray(raw))
    return raw.map((id) => systeme.entrees.get(id)?.nom ?? id).join(', ') || undefined;
  switch (champ.type) {
    case 'entree':
      return systeme.entrees.get(String(raw))?.nom ?? String(raw);
    case 'attribut':
      return fiche.entite.attributs.get(String(raw))?.nom ?? String(raw);
    case 'booleen':
      return raw === true ? 'oui' : 'non';
    default:
      return String(raw);
  }
}

function fieldsOf(fiche: Fiche, sorte: Sorte, entry: Entree, skip?: string) {
  const r: { name: string; value: string }[] = [];
  for (const c of sorte.champs) {
    if (c.id === skip || entry.champs[c.id] === undefined) continue;
    const v = fieldValue(fiche.systeme, fiche, sorte, entry, c.id);
    if (v === undefined || v === 'non') continue;
    r.push({ name: c.nom, value: v });
  }
  return r;
}

/** Bonus réellement appliqués par l'entrée : lignes d'explication dont elle est la source. */
function appliedBonuses(fiche: Fiche, id: string): BonusTag[] {
  const r: BonusTag[] = [];
  for (const v of fiche.valeurs.values()) {
    for (const l of v.detail) {
      if (l.ignore || l.desactive || (l.source !== id && !l.source.startsWith(`${id}#`))) continue;
      const nom = attributeLabel(fiche, v.cle);
      const val = l.valeur;
      const label =
        l.operation === 'ajouter'
          ? `${nom} ${signed(val)}`
          : operationLisible(nom, l.operation, val);
      if (label) r.push({ label, applied: true });
    }
  }
  return r;
}

function diceName(systeme: SystemeCharge, id: string): string {
  return systeme.source.des?.sortes.find((d) => d.id === id)?.nom ?? id;
}

type EffetJet = Extract<Effet, { sur: 'jet' }>;

/** Dés d'un ajout au jet : ajoutés, améliorés, rétrogradés ou retirés. */
function diceChange(
  s: SystemeCharge,
  a: NonNullable<EffetJet['ajout']>,
  n: (f: string) => string,
): string | null {
  if ('de' in a) return `+${n(a.nombre)} ${diceName(s, a.de)}`;
  if ('ameliorer' in a)
    return `${n(a.nombre)} ${diceName(s, a.ameliorer)} → ${diceName(s, a.vers)}`;
  if ('retrograder' in a)
    return `${n(a.nombre)} ${diceName(s, a.retrograder)} → ${diceName(s, a.vers)}`;
  if ('retirer' in a) return `−${n(a.nombre)} ${diceName(s, a.retirer)}`;
  return null;
}

/** Ce que l'effet implique (entrée, attribut), sinon les jets visés quand ce n'est pas un bonus. */
function rollTarget(
  fiche: Fiche,
  e: EffetJet,
  jetsVisesTexte: string | null,
  isBonus: boolean,
): string | undefined {
  if (e.implique?.entree) return fiche.systeme.entrees.get(e.implique.entree)?.nom;
  if (e.implique?.attribut) return fiche.entite.attributs.get(e.implique.attribut)?.nom;
  if (jetsVisesTexte && !isBonus) return jetsVisesTexte;
  return undefined;
}

/** Texte d'un effet de jet : dés ajoutés, améliorés, retirés, bonus, et ce qu'il implique. */
export function rollEffectText(fiche: Fiche, e: Effet, rank: number): string | null {
  if (e.sur !== 'jet') return null;
  if (e.description) return e.description;
  const s = fiche.systeme;
  const n = (f: string) => {
    if (f.trim() === 'rang') return String(rank);
    const x = Number(f);
    return Number.isFinite(x) ? String(x) : f;
  };
  const a = e.ajout;
  let base = a ? diceChange(s, a, n) : null;
  // Condition qui ne fait que choisir la caractéristique : « aux jets de DEX »
  const vises = !e.implique && e.si !== undefined ? jetsVises(fiche, e.si) : null;
  const jets = vises
    ? translate('sheet.effects.toRollsOf', { name: vises.join(', ') })
    : translate('sheet.skills.toTheRoll');
  if (a && 'bonus' in a) base = `${/^[-−]/.test(a.bonus) ? '' : '+'}${n(a.bonus)} ${jets}`;
  if (!base) return null;
  const cible = rollTarget(fiche, e, vises ? jets : null, !!a && 'bonus' in a);
  const cote = e.cote === 'cible' ? ' (en défense)' : '';
  return `${base}${cible ? ` · ${cible}` : ''}${cote}`;
}

/** Dés écrits dans les champs formule de l'entrée (« 2d6 + @FOR »…). */
function diceFields(sorte: Sorte, entry: Entree): string[] {
  const r: string[] = [];
  for (const c of sorte.champs) {
    if (c.type !== 'formule') continue;
    const v = entry.champs[c.id];
    if (typeof v === 'string' && /\b\d*d\d+/i.test(v)) r.push(`${c.nom} : ${v}`);
  }
  return r;
}

function filterOf(
  fiche: Fiche,
  sorte: Sorte,
  entry: Entree,
  filtreChamp: string | undefined,
): FilterValue | undefined {
  if (!filtreChamp) return undefined;
  const v = fieldValue(fiche.systeme, fiche, sorte, entry, filtreChamp);
  return v === undefined
    ? { key: '', label: translate('notes.quest.unspecified') }
    : { key: v, label: v };
}

/** Étiquette lisible : identifiant du système, première lettre en capitale, tirets en espaces. */
export function tagLabel(tag: string): string {
  const t = tag.replace(/[-_]+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

type Disponible = ReturnType<typeof achatsPossibles>[number];
type Compte = { total: number; active: number };

/**
 * Achats qui visent la sorte : directs (rang de compétence…), ou indirects : voie à rangs qui
 * accorde ses entrées, arbre dont des nœuds les donnent.
 */
function purchasesOf(fiche: Fiche, sorteId: string) {
  const { systeme, etat } = fiche;
  const paths = pathSortes(systeme, etat.type).filter((ps) =>
    [...systeme.entrees.values()].some(
      (e) =>
        e.sorte === ps.id &&
        e.effets.some((x) => x.sur === 'rang' && systeme.entrees.get(x.entree)?.sorte === sorteId),
    ),
  );
  const trees = [...systeme.arbres.values()].filter((a) =>
    a.noeuds.some((n) => systeme.entrees.get(n.entree)?.sorte === sorteId),
  );
  const direct = new Set<string>();
  const indirect = new Set<string>();
  for (const a of systeme.achats.values()) {
    const o = a.obtient;
    if ((o.type === 'rang' || o.type === 'entree') && o.sorte === sorteId) direct.add(a.id);
    else if (o.type === 'rang' && paths.some((p) => p.id === o.sorte)) indirect.add(a.id);
    else if (o.type === 'noeud' && trees.some((t) => !o.arbres || o.arbres.includes(t.id)))
      indirect.add(a.id);
  }
  return { trees, direct, indirect };
}

/** Progression dans la monnaie d'un achat : solde et achats possibles, cumulés. */
function addProgress(
  progress: Map<string, Progress>,
  systeme: SystemeCharge,
  d: Disponible,
  possible: number,
  viaTree: boolean,
) {
  const cur = progress.get(d.achat.monnaie) ?? {
    currency: d.achat.monnaie,
    currencyName: systeme.monnaies.get(d.achat.monnaie)?.nom ?? d.achat.monnaie,
    balance: d.solde,
    possible: 0,
    viaTree: false,
  };
  cur.possible += possible;
  cur.viaTree ||= viaTree;
  progress.set(d.achat.monnaie, cur);
}

/** Meilleure offre par objet : une offre possible remplace une offre impossible. */
function addOffers(offers: Map<string, ObjetAchetable>, objets: ObjetAchetable[]) {
  for (const o of objets) {
    const prev = offers.get(o.objet);
    if (!prev || (!prev.possible && o.possible)) offers.set(o.objet, o);
  }
}

/** Offres directes, progression par monnaie, et rangs achetables sur la sorte. */
function offersOf(fiche: Fiche, sorteId: string) {
  const { trees, direct, indirect } = purchasesOf(fiche, sorteId);
  const ids = [...direct, ...indirect];
  const available = ids.length ? achatsPossibles(fiche, ids) : [];

  const offers = new Map<string, ObjetAchetable>();
  const progress = new Map<string, Progress>();
  let rankPurchase = false;
  for (const d of available) {
    const viaTree = indirect.has(d.achat.id);
    // Par une voie : seules les voies possédées ; par un arbre : ses seuls arbres
    const relevant = d.objets.filter((o) => relevantOffer(fiche, trees, o, viaTree));
    addProgress(progress, fiche.systeme, d, relevant.filter((o) => o.possible).length, viaTree);
    if (viaTree) continue;
    if (d.achat.obtient.type === 'rang') rankPurchase = true;
    addOffers(offers, relevant);
  }
  return { offers, progress, rankPurchase };
}

/** Objet d'un achat indirect qui compte : arbre de la sorte, ou voie possédée. */
function relevantOffer(
  fiche: Fiche,
  trees: ReturnType<typeof purchasesOf>['trees'],
  o: ObjetAchetable,
  viaTree: boolean,
): boolean {
  if (!viaTree) return true;
  if (o.arbre) return trees.some((t) => t.id === o.arbre);
  return fiche.possessions.has(o.objet);
}

/** Entrées en cartes : tout le catalogue si les rangs s'achètent (rang 0 compris), sinon les possédées. */
function entriesOf(fiche: Fiche, sorteId: string, rankPurchase: boolean): Entree[] {
  if (rankPurchase) return [...fiche.systeme.entrees.values()].filter((e) => e.sorte === sorteId);
  return [...fiche.possessions.values()]
    .filter((p) => p.sorte.id === sorteId && (p.rang > 0 || !p.sorte.rangs || !!p.possession))
    .map((p) => p.entree);
}

/** Bonus par entrée possédée de la sorte, calculés une fois pour toutes les cartes. */
function bonusCounts(fiche: Fiche, sorteId: string): Map<string, Compte> {
  const bonusParEntree = new Map<string, Compte>();
  for (const e of effetsDuPersonnage(fiche)) {
    const id = e.possession?.entree.id;
    if (!id || e.possession?.sorte.id !== sorteId) continue;
    const c = bonusParEntree.get(id) ?? { total: 0, active: 0 };
    c.total++;
    if (e.statut === 'actif') c.active++;
    bonusParEntree.set(id, c);
  }
  return bonusParEntree;
}

/** Nom lisible d'une source de possession (entrée, ou arbre d'un nœud `arbre/noeud`). */
function sourceName(systeme: SystemeCharge, id: string): string | null {
  const base = id.split('#')[0]!;
  const [arbre] = base.split('/');
  return systeme.entrees.get(base)?.nom ?? systeme.arbres.get(arbre ?? '')?.nom ?? null;
}

/** Effets décrits mais non appliqués (entrée inactive, rang 0, condition fausse). */
function describedBonuses(fiche: Fiche, entry: Entree): BonusTag[] {
  return entry.effets
    .filter((e) => e.sur === 'attribut')
    .map((e) => texteEffet(fiche, e))
    .filter((t): t is string => !!t)
    .map((label) => ({ label, applied: false }));
}

/** Ce que toutes les cartes d'une sorte partagent. */
interface CardScope {
  fiche: Fiche;
  sorte: Sorte;
  filtreChamp: string | undefined;
  max: number | undefined;
  offers: Map<string, ObjetAchetable>;
  bonusParEntree: Map<string, Compte>;
}

/** Carte d'une entrée : rang, état actif, bonus, jets, champs, filtre, offre, origines. */
function cardOf(scope: CardScope, entry: Entree): SkillCard {
  const { fiche, sorte, filtreChamp, max } = scope;
  const p = fiche.possessions.get(entry.id);
  const rank = p?.rang ?? 0;
  const actifSansPossession = sorte.activable ? sorte.actifParDefaut : true;
  const applied = p ? appliedBonuses(fiche, entry.id) : [];
  const rolls = [
    ...entry.effets
      .map((e) => rollEffectText(fiche, e, Math.max(rank, 1)))
      .filter((t): t is string => !!t),
    ...diceFields(sorte, entry),
  ];
  const filter = filterOf(fiche, sorte, entry, filtreChamp);
  const offer = scope.offers.get(entry.id);
  const uses = usagesDe(fiche, entry.id);
  const origins = (p?.sources ?? [])
    .filter((s) => s !== entry.id)
    .map((s) => sourceName(fiche.systeme, s))
    .filter((n): n is string => !!n);
  return {
    entry,
    ...(p ? { possession: p } : {}),
    rank,
    ...(max !== undefined ? { maxRank: max } : {}),
    activable: sorte.activable,
    active: p ? p.actif : actifSansPossession,
    bonuses: [...applied, ...(applied.length ? [] : describedBonuses(fiche, entry))],
    rolls,
    bonusCount: scope.bonusParEntree.get(entry.id) ?? {
      total: entry.effets.filter(effetEstBonus).length,
      active: 0,
    },
    fields: fieldsOf(fiche, sorte, entry, filtreChamp),
    ...(filter ? { filter } : {}),
    ...(offer ? { offer } : {}),
    origins: [...new Set(origins)],
    ...(uses ? { uses } : {}),
  };
}

/** Ordre des cartes : actives, puis à rang, puis par nom. */
function compareCards(a: SkillCard, b: SkillCard): number {
  return (
    Number(b.activable && b.active) - Number(a.activable && a.active) ||
    Number(b.rank > 0) - Number(a.rank > 0) ||
    a.entry.nom.localeCompare(b.entry.nom, 'fr')
  );
}

/** Filtres : valeurs du champ déclaré par la présentation, sinon étiquettes des entrées. */
function filtersOf(sorte: Sorte, cards: SkillCard[], filtreChamp: string | undefined) {
  const counts = new Map<string, FilterValue & { count: number }>();
  const add = (f: FilterValue) => {
    const cur = counts.get(f.key) ?? { ...f, count: 0 };
    cur.count++;
    counts.set(f.key, cur);
  };
  let filterLabel: string | undefined;
  if (filtreChamp) {
    filterLabel = sorte.champs.find((c) => c.id === filtreChamp)?.nom;
    for (const c of cards)
      add(c.filter ?? { key: '', label: translate('notes.quest.unspecified') });
  } else {
    for (const c of cards) for (const t of c.entry.etiquettes) add({ key: t, label: tagLabel(t) });
    if (counts.size) filterLabel = translate('notes.props.tags');
  }
  const filters = [...counts.values()].sort((a, b) => compareText(a.label, b.label));
  return { filters, filterLabel };
}

export function buildSkills(
  fiche: Fiche,
  sorteId: string,
  filtreChamp?: string,
): SkillsData | null {
  const sorte = fiche.systeme.sortes.get(sorteId);
  if (!sorte) return null;

  const { offers, progress, rankPurchase } = offersOf(fiche, sorteId);
  const scope: CardScope = {
    fiche,
    sorte,
    filtreChamp,
    max: maxRank(fiche, sorte),
    offers,
    bonusParEntree: bonusCounts(fiche, sorteId),
  };
  const cards = entriesOf(fiche, sorteId, rankPurchase).map((entry) => cardOf(scope, entry));
  cards.sort(compareCards);
  const { filters, filterLabel } = filtersOf(sorte, cards, filtreChamp);

  return {
    sorte,
    cards,
    filters: filters.length > 1 || filtreChamp ? filters : [],
    ...(filterLabel ? { filterLabel } : {}),
    progress: [...progress.values()],
    rankPurchase,
  };
}

/** L'entrée passe le filtre choisi (valeur du champ, ou étiquette). */
export function matchesFilter(card: SkillCard, key: string | null, byField: boolean): boolean {
  if (key === null) return true;
  return byField ? (card.filter?.key ?? '') === key : card.entry.etiquettes.includes(key);
}

export interface EntryDescription {
  /** Bonus appliqués sur la fiche (valeurs calculées). */
  applied: BonusTag[];
  /** Effets du catalogue, décrits (attributs, rangs accordés, marques, dégâts). */
  effects: string[];
  rolls: string[];
  fields: { name: string; value: string }[];
}

/** Tout ce qui se dit d'une entrée, possédée ou non (détail d'une carte ou d'un nœud). */
export function describeEntry(fiche: Fiche, entry: Entree): EntryDescription {
  const sorte = fiche.systeme.sortes.get(entry.sorte);
  const p = fiche.possessions.get(entry.id);
  const rank = Math.max(p?.rang ?? 0, 1);
  return {
    applied: p ? appliedBonuses(fiche, entry.id) : [],
    effects: entry.effets
      .filter((e) => e.sur !== 'jet')
      .map((e) => texteEffet(fiche, e))
      .filter((t): t is string => !!t),
    rolls: entry.effets.map((e) => rollEffectText(fiche, e, rank)).filter((t): t is string => !!t),
    fields: sorte ? fieldsOf(fiche, sorte, entry) : [],
  };
}

/** Opération d'un bonus autre qu'un ajout, lisible : ×2, = 3, ≥ 1, ≤ 5 (inconnue : null). */
function operationLisible(nom: string, operation: string, val: unknown): string | null {
  const symbole = SYMBOLES_OPERATION[operation];
  return symbole ? `${nom} ${symbole}${String(val)}` : null;
}

const SYMBOLES_OPERATION: Record<string, string> = {
  multiplier: '×',
  fixer: '= ',
  minimum: '≥ ',
  maximum: '≤ ',
};
