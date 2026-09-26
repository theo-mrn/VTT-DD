/** Mise en forme des valeurs de la fiche, d'après la nature déclarée par le système. */
import type { Attribut, LigneJournal, Operation, SystemeCharge, Valeur } from '@vtt/rules';

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/** « +2 », « −1 », « +0 ». */
export function formatSign(n: number): string {
  return n < 0 ? `−${formatNumber(-n)}` : `+${formatNumber(n)}`;
}

export function formatValue(attribute: Attribut | undefined, v: Valeur | undefined): string {
  if (v === undefined) return '—';
  if (attribute?.nature === 'choix')
    return attribute.options.find((o) => o.valeur === v)?.nom ?? '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'number') return formatNumber(v);
  return v || '—';
}

/** Symbole d'une ligne d'explication. */
export const OPERATION_SYMBOLS: Record<Operation, string> = {
  base: '=',
  formule: '=',
  ajouter: '+',
  multiplier: '×',
  fixer: '=',
  minimum: '≥',
  maximum: '≤',
  borne: '⇥',
};

export const OPERATION_LABELS: Record<Operation, string> = {
  base: 'valeur de base',
  formule: 'calcul',
  ajouter: 'ajout',
  multiplier: 'multiplication',
  fixer: 'valeur fixée',
  minimum: 'minimum',
  maximum: 'maximum',
  borne: 'borne',
};

/** Nom lisible de l'objet d'un achat : attribut, entrée ou `arbre/nœud`. */
export function itemName(system: SystemeCharge, type: string, line: Pick<LigneJournal, 'objet'>) {
  const o = line.objet;
  const entry = system.entrees.get(o);
  if (entry) return entry.nom;
  const attribute = system.entites.get(type)?.attributs.get(o);
  if (attribute) return attribute.nom;
  const [treeId, nodeId] = o.split('/');
  const tree = treeId ? system.arbres.get(treeId) : undefined;
  const node = tree?.noeuds.find((n) => n.id === nodeId);
  if (tree && node) return `${system.entrees.get(node.entree)?.nom ?? node.entree} (${tree.nom})`;
  return o;
}

/** Nom lisible d'une marque (clé posée par un effet) : « carriere » → « Carriere ». */
export function tagName(tag: string) {
  const words = tag.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}
