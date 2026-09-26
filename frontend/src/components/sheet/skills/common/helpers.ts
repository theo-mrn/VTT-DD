/**
 * Lectures sans rendu, communes aux entrées à rangs, aux listes d'entrées et
 * aux arbres. Aucune clé de jeu : tout vient des sortes, des achats, du
 * journal et des marques posées par le système.
 */
import {
  chemins,
  essayer,
  rembourser,
  type AchatDisponible,
  type Blocage,
  type Champ,
  type Entree,
  type EtatEntite,
  type Fiche,
  type ObjetAchetable,
  type Sorte,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';

/** Normalise un texte pour la recherche (casse et accents ignorés). */
export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export const byName = (a: { nom: string }, b: { nom: string }) => a.nom.localeCompare(b.nom, 'fr');

/** Entrées du catalogue d'une sorte, dans l'ordre du catalogue. */
export function entriesOfKind(system: SystemeCharge, kind: string): Entree[] {
  return [...system.entrees.values()].filter((e) => e.sorte === kind);
}

/** Un achat du système vise-t-il cette sorte (rang ou nouvelle entrée) ? */
export function kindIsPurchasable(
  system: SystemeCharge,
  kind: string,
  type?: 'rang' | 'entree',
): boolean {
  for (const a of system.achats.values()) {
    const o = a.obtient;
    if (
      (o.type === 'rang' || o.type === 'entree') &&
      o.sorte === kind &&
      (!type || o.type === type)
    )
      return true;
  }
  return false;
}

/** Sorte dont les entrées s'obtiennent par un nœud d'arbre. */
export function kindFromTrees(system: SystemeCharge, kind: string): boolean {
  for (const a of system.arbres.values())
    for (const n of a.noeuds) if (system.entrees.get(n.entree)?.sorte === kind) return true;
  return false;
}

/** Rang maximal d'une sorte à rangs (formule du système), ou undefined. */
export function maxRankOf(sheet: Fiche, kind: Sorte): number | undefined {
  if (!kind.rangs) return undefined;
  const f = sheet.systeme.formules.get(chemins.rangsMax(kind.id));
  if (!f) return undefined;
  const r = essayer(sheet, f);
  const n = r.ok ? Number(r.valeur) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Objet achetable d'un type donné pour une entrée (rang suivant, ou entrée elle-même). */
export function itemFor(
  purchases: AchatDisponible[],
  type: 'rang' | 'entree',
  entry: string,
): ObjetAchetable | undefined {
  let blocked: ObjetAchetable | undefined;
  for (const a of purchases)
    for (const o of a.objets)
      if (o.type === type && o.objet === entry) {
        if (o.possible) return o;
        blocked ??= o;
      }
  return blocked;
}

/** Objets achetables des nœuds d'un arbre, par identifiant de nœud. */
export function nodeItems(purchases: AchatDisponible[], tree: string): Map<string, ObjetAchetable> {
  const m = new Map<string, ObjetAchetable>();
  for (const a of purchases)
    for (const o of a.objets)
      if (o.type === 'noeud' && o.arbre === tree && o.noeud && (!m.has(o.noeud) || o.possible))
        m.set(o.noeud, o);
  return m;
}

/** Solde des monnaies utilisées par des achats, dans l'ordre des achats. */
export function balances(
  system: SystemeCharge,
  purchases: AchatDisponible[],
  keep: (p: AchatDisponible) => boolean = () => true,
): { id: string; name: string; balance: number }[] {
  const seen = new Map<string, { id: string; name: string; balance: number }>();
  for (const p of purchases) {
    if (!keep(p) || seen.has(p.achat.monnaie)) continue;
    seen.set(p.achat.monnaie, {
      id: p.achat.monnaie,
      name: currencyName(system, p.achat.monnaie),
      balance: p.solde,
    });
  }
  return [...seen.values()];
}

export function currencyName(system: SystemeCharge, id: string) {
  return system.monnaies.get(id)?.nom ?? id;
}

/** Indices des lignes du journal qui portent sur un objet, du plus ancien au plus récent. */
export function journalLines(state: EtatEntite, item: string): number[] {
  const r: number[] = [];
  state.journal.forEach((l, i) => l.objet === item && r.push(i));
  return r;
}

/** Remboursement d'une ligne du journal : null s'il est possible, sinon la raison. */
export function refundError(
  system: SystemeCharge,
  state: EtatEntite,
  index: number,
): string | null {
  try {
    const r = rembourser(system, state, index);
    return r.ok ? null : r.erreur;
  } catch (e) {
    return e instanceof Error ? e.message : 'Remboursement impossible';
  }
}

/**
 * Remboursement de toutes les lignes d'un objet, de la plus récente à la plus
 * ancienne : null si toute la chaîne passe, sinon la première raison.
 */
export function refundAllError(
  system: SystemeCharge,
  state: EtatEntite,
  lines: number[],
): string | null {
  let s = state;
  for (const i of [...lines].reverse()) {
    try {
      const r = rembourser(system, s, i);
      if (!r.ok) return r.erreur;
      s = r.etat;
    } catch (e) {
      return e instanceof Error ? e.message : 'Remboursement impossible';
    }
  }
  return null;
}

/** Ce qui bloque un achat, résumé pour un bouton. */
export type BlockKind = 'max' | 'funds' | 'locked';

export function blockKind(item: ObjetAchetable): BlockKind | null {
  if (item.possible) return null;
  const codes = new Set(item.blocages.map((b: Blocage) => b.code));
  if (codes.has('rang-max') || codes.has('plafond') || codes.has('deja')) return 'max';
  if (codes.size === 1 && codes.has('solde')) return 'funds';
  return 'locked';
}

export const blockMessages = (item: ObjetAchetable) => item.blocages.map((b) => b.message);

/** Premier champ « attribut » d'une sorte (caractéristique liée…). */
export function linkedAttributeField(kind: Sorte) {
  return kind.champs.find((c): c is Extract<Champ, { type: 'attribut' }> => c.type === 'attribut');
}

/** Premier champ « entrée » d'une sorte : il pointe vers une autre sorte (carrière d'origine…). */
export function parentEntryField(kind: Sorte) {
  return kind.champs.find((c): c is Extract<Champ, { type: 'entree' }> => c.type === 'entree');
}

/**
 * Champ de regroupement d'une sorte : celui demandé par la présentation, sinon
 * un champ texte nommé `groupe` s'il existe.
 */
export function groupFieldOf(kind: Sorte, requested?: string): Champ | undefined {
  if (requested) return kind.champs.find((c) => c.id === requested);
  return kind.champs.find((c) => c.id === 'groupe' && c.type === 'texte');
}

/** Valeur d'un champ pour une entrée : celle de l'exemplaire possédé, de l'entrée, sinon le défaut. */
export function rawField(
  state: EtatEntite,
  entry: Entree,
  field: Champ,
): number | string | boolean | string[] | undefined {
  const p = state.possessions.find((x) => x.entree === entry.id);
  const v = p?.champs[field.id] ?? entry.champs[field.id];
  if (v !== undefined) return v;
  return 'defaut' in field ? field.defaut : undefined;
}

/** Valeur d'un champ, lisible (noms d'attribut ou d'entrée résolus) ; '' si vide. */
export function readableField(sheet: Fiche, entry: Entree, field: Champ): string {
  const system = sheet.systeme;
  const v = rawField(sheet.etat, entry, field);
  if (v === undefined || v === '') return '';
  if (Array.isArray(v)) return v.map((id) => system.entrees.get(id)?.nom ?? id).join(', ');
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (field.type === 'attribut')
    return system.entites.get(field.entite)?.attributs.get(String(v))?.nom ?? String(v);
  if (field.type === 'entree') return system.entrees.get(String(v))?.nom ?? String(v);
  if (typeof v === 'number') return v.toLocaleString('fr-FR');
  return v;
}

export function formatValue(v: Valeur | undefined): string {
  if (v === undefined) return '—';
  if (typeof v === 'number')
    return Number.isFinite(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  return v || '—';
}

/** Nom lisible d'une marque (clé posée par un effet) : « carriere » → « Carriere ». */
export function markName(mark: string) {
  const words = mark.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** Marques posées par le système sur une entrée. */
export function marksOf(sheet: Fiche, entry: string): string[] {
  return [...(sheet.marques.get(entry) ?? [])];
}

/**
 * Provenances lisibles d'une possession (hors état saisi) : entrée qui donne
 * un rang, nœud d'arbre, bonus.
 */
export function sourceNames(system: SystemeCharge, sources: string[]): string[] {
  const names = new Set<string>();
  for (const group of sources)
    for (const raw of group.split(', ')) {
      if (!raw || raw === 'etat') continue;
      const id = raw.split('#')[0]!;
      const entry = system.entrees.get(id);
      if (entry) {
        names.add(entry.nom);
        continue;
      }
      const [treeId, nodeId] = id.split('/');
      const tree = treeId ? system.arbres.get(treeId) : undefined;
      if (tree && nodeId) {
        names.add(tree.nom);
        continue;
      }
      names.add(id.startsWith('bonus:') ? 'Bonus' : id);
    }
  return [...names];
}

/** Coût d'un nœud d'après sa formule, quand aucun achat ne le liste. */
export function nodeCost(sheet: Fiche, tree: string, node: { id: string; x: number; y: number }) {
  const f = sheet.systeme.formules.get(chemins.noeud(tree, node.id));
  if (!f) return undefined;
  const r = essayer(sheet, f, {
    variable: (name: string) => (name === 'x' ? node.x : name === 'y' ? node.y : 0),
  });
  return r.ok ? Number(r.valeur) : undefined;
}

/** Libellé court d'un blocage, pour un bouton désactivé. */
export function blockLabel(kind: BlockKind | null): string {
  if (kind === 'max') return 'Rang maximum atteint';
  if (kind === 'funds') return 'Solde insuffisant';
  return 'Prérequis manquant';
}
