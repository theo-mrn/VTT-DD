/**
 * Données du bloc Compétences en cartes, calculées par le moteur sans rien connaître du jeu :
 * entrées d'une sorte, état actif (sortes `activable`), bonus réellement appliqués (lignes
 * d'explication des valeurs dont la source est l'entrée), effets de jet (dés ajoutés,
 * améliorés…), filtres par la valeur d'un champ de la sorte, et progression (achats qui visent
 * la sorte, directement ou par une voie ou un arbre qui en accorde les entrées).
 */
import {
  achatsPossibles,
  type Effet,
  type Entree,
  type Fiche,
  type ObjetAchetable,
  type PossessionEffective,
  type Sorte,
  type SystemeCharge,
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
          : l.operation === 'multiplier'
            ? `${nom} ×${String(val)}`
            : l.operation === 'fixer'
              ? `${nom} = ${String(val)}`
              : l.operation === 'minimum'
                ? `${nom} ≥ ${String(val)}`
                : l.operation === 'maximum'
                  ? `${nom} ≤ ${String(val)}`
                  : null;
      if (label) r.push({ label, applied: true });
    }
  }
  return r;
}

function diceName(systeme: SystemeCharge, id: string): string {
  return systeme.source.des?.sortes.find((d) => d.id === id)?.nom ?? id;
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
  let base: string | null = null;
  if (a) {
    if ('de' in a) base = `+${n(a.nombre)} ${diceName(s, a.de)}`;
    else if ('ameliorer' in a)
      base = `${n(a.nombre)} ${diceName(s, a.ameliorer)} → ${diceName(s, a.vers)}`;
    else if ('retrograder' in a)
      base = `${n(a.nombre)} ${diceName(s, a.retrograder)} → ${diceName(s, a.vers)}`;
    else if ('retirer' in a) base = `−${n(a.nombre)} ${diceName(s, a.retirer)}`;
  }
  // Condition qui ne fait que choisir la caractéristique : « aux jets de DEX »
  const vises = !e.implique && e.si !== undefined ? jetsVises(fiche, e.si) : null;
  const jets = vises ? `aux jets de ${vises.join(', ')}` : 'au jet';
  if (a && 'bonus' in a) base = `${/^[-−]/.test(a.bonus) ? '' : '+'}${n(a.bonus)} ${jets}`;
  if (!base) return null;
  const cible = e.implique?.entree
    ? s.entrees.get(e.implique.entree)?.nom
    : e.implique?.attribut
      ? fiche.entite.attributs.get(e.implique.attribut)?.nom
      : vises && !(a && 'bonus' in a)
        ? jets
        : undefined;
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
  return v === undefined ? { key: '', label: 'Non précisé' } : { key: v, label: v };
}

/** Étiquette lisible : identifiant du système, première lettre en capitale, tirets en espaces. */
export function tagLabel(tag: string): string {
  const t = tag.replace(/[-_]+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function buildSkills(
  fiche: Fiche,
  sorteId: string,
  filtreChamp?: string,
): SkillsData | null {
  const { systeme, etat } = fiche;
  const sorte = systeme.sortes.get(sorteId);
  if (!sorte) return null;

  // Achats directs sur la sorte (rang de compétence…), ou indirects : voie à rangs qui accorde
  // ses entrées, arbre dont des nœuds les donnent
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
  const ids = [...direct, ...indirect];
  const available = ids.length ? achatsPossibles(fiche, ids) : [];

  const offers = new Map<string, ObjetAchetable>();
  const progress = new Map<string, Progress>();
  let rankPurchase = false;
  for (const d of available) {
    const viaTree = indirect.has(d.achat.id);
    // Par une voie : seules les voies possédées ; par un arbre : ses seuls arbres
    const relevant = d.objets.filter((o) =>
      !viaTree
        ? true
        : o.arbre
          ? trees.some((t) => t.id === o.arbre)
          : fiche.possessions.has(o.objet),
    );
    const cur = progress.get(d.achat.monnaie) ?? {
      currency: d.achat.monnaie,
      currencyName: systeme.monnaies.get(d.achat.monnaie)?.nom ?? d.achat.monnaie,
      balance: d.solde,
      possible: 0,
      viaTree: false,
    };
    cur.possible += relevant.filter((o) => o.possible).length;
    cur.viaTree ||= viaTree;
    progress.set(d.achat.monnaie, cur);
    if (viaTree) continue;
    if (d.achat.obtient.type === 'rang') rankPurchase = true;
    for (const o of relevant) {
      const prev = offers.get(o.objet);
      if (!prev || (!prev.possible && o.possible)) offers.set(o.objet, o);
    }
  }

  const max = maxRank(fiche, sorte);
  // Une sorte dont les rangs s'achètent montre tout son catalogue (rang 0 compris)
  const entries = rankPurchase
    ? [...systeme.entrees.values()].filter((e) => e.sorte === sorteId)
    : [...fiche.possessions.values()]
        .filter((p) => p.sorte.id === sorteId && (p.rang > 0 || !p.sorte.rangs || !!p.possession))
        .map((p) => p.entree);

  const sourceName = (id: string) => {
    const base = id.split('#')[0]!;
    const [arbre] = base.split('/');
    return systeme.entrees.get(base)?.nom ?? systeme.arbres.get(arbre ?? '')?.nom ?? null;
  };

  // Bonus par entrée possédée, calculés une fois pour toutes les cartes
  const bonusParEntree = new Map<string, { total: number; active: number }>();
  for (const e of effetsDuPersonnage(fiche)) {
    const id = e.possession?.entree.id;
    if (!id || e.possession?.sorte.id !== sorteId) continue;
    const c = bonusParEntree.get(id) ?? { total: 0, active: 0 };
    c.total++;
    if (e.statut === 'actif') c.active++;
    bonusParEntree.set(id, c);
  }

  const cards: SkillCard[] = entries.map((entry) => {
    const p = fiche.possessions.get(entry.id);
    const rank = p?.rang ?? 0;
    const active = p ? p.actif : sorte.activable ? sorte.actifParDefaut : true;
    const applied = p ? appliedBonuses(fiche, entry.id) : [];
    // Effets décrits mais non appliqués (entrée inactive, rang 0, condition fausse)
    const described = applied.length
      ? []
      : entry.effets
          .filter((e) => e.sur === 'attribut')
          .map((e) => texteEffet(fiche, e))
          .filter((t): t is string => !!t)
          .map((label) => ({ label, applied: false }));
    const rolls = [
      ...entry.effets
        .map((e) => rollEffectText(fiche, e, Math.max(rank, 1)))
        .filter((t): t is string => !!t),
      ...diceFields(sorte, entry),
    ];
    const filter = filterOf(fiche, sorte, entry, filtreChamp);
    const offer = offers.get(entry.id);
    const origins = (p?.sources ?? [])
      .filter((s) => s !== entry.id)
      .map(sourceName)
      .filter((n): n is string => !!n);
    return {
      entry,
      ...(p ? { possession: p } : {}),
      rank,
      ...(max !== undefined ? { maxRank: max } : {}),
      activable: sorte.activable,
      active,
      bonuses: [...applied, ...described],
      rolls,
      bonusCount: bonusParEntree.get(entry.id) ?? {
        total: entry.effets.filter(effetEstBonus).length,
        active: 0,
      },
      fields: fieldsOf(fiche, sorte, entry, filtreChamp),
      ...(filter ? { filter } : {}),
      ...(offer ? { offer } : {}),
      origins: [...new Set(origins)],
    };
  });
  cards.sort(
    (a, b) =>
      Number(b.activable && b.active) - Number(a.activable && a.active) ||
      Number(b.rank > 0) - Number(a.rank > 0) ||
      a.entry.nom.localeCompare(b.entry.nom, 'fr'),
  );

  // Filtres : valeurs du champ déclaré par la présentation, sinon étiquettes des entrées
  const counts = new Map<string, FilterValue & { count: number }>();
  let filterLabel: string | undefined;
  if (filtreChamp) {
    filterLabel = sorte.champs.find((c) => c.id === filtreChamp)?.nom;
    for (const c of cards) {
      const f = c.filter ?? { key: '', label: 'Non précisé' };
      const cur = counts.get(f.key) ?? { ...f, count: 0 };
      cur.count++;
      counts.set(f.key, cur);
    }
  } else {
    for (const c of cards)
      for (const t of c.entry.etiquettes) {
        const cur = counts.get(t) ?? { key: t, label: tagLabel(t), count: 0 };
        cur.count++;
        counts.set(t, cur);
      }
    if (counts.size) filterLabel = 'Étiquettes';
  }
  const filters = [...counts.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'));

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
