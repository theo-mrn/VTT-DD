/**
 * Lecture et construction des effets de bonus, sans rendu : description
 * lisible d'un effet et cibles proposées à l'ajout d'un bonus libre, toutes
 * tirées du système (aucune clé de jeu ici).
 */
import type { Attribut, Effet, Entree, FicheJson, Sorte, SystemeCharge } from '@vtt/rules';
import { formatSign, tagName } from './format';

type AttributeEffect = Extract<Effet, { sur: 'attribut' }>;
export type AttributeOperation = AttributeEffect['operation'];
type RollEffect = Extract<Effet, { sur: 'jet' }>;

export const OPERATIONS: { id: AttributeOperation; label: string }[] = [
  { id: 'ajouter', label: 'Ajouter' },
  { id: 'multiplier', label: 'Multiplier' },
  { id: 'fixer', label: 'Fixer à' },
  { id: 'minimum', label: 'Au moins' },
  { id: 'maximum', label: 'Au plus' },
];

const isPlainNumber = (f: string) => /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(f);

/** « +2 », « −1 », ou « + (formule) ». */
export function signedFormula(f: string): string {
  if (isPlainNumber(f)) return formatSign(Number(f.replace(',', '.')));
  const t = f.trim();
  return t.startsWith('-') ? `− (${t.slice(1).trim()})` : `+ (${t})`;
}

const plain = (f: string) => (isPlainNumber(f) ? f.trim() : `(${f.trim()})`);

export interface Names {
  attribute(key: string): string;
  entry(id: string): string;
  die(id: string): string;
  action(id: string): string;
  damageType(id: string): string;
}

export function namesFor(system: SystemeCharge, type: string): Names {
  const attributes = system.entites.get(type)?.attributs;
  return {
    attribute: (k) => {
      const a = attributes?.get(k);
      return a ? (a.abrege ?? a.nom) : k;
    },
    entry: (id) => system.entrees.get(id)?.nom ?? id,
    die: (id) => system.source.des?.sortes.find((d) => d.id === id)?.nom ?? id,
    action: (id) => system.actions.get(id)?.nom ?? id,
    damageType: (id) => system.source.typesDegats.find((t) => t.id === id)?.nom ?? id,
  };
}

/** Jets concernés par un effet de jet : « Jets de Discrétion », « Attaque », « Tous les jets ». */
function rollScope(e: RollEffect, n: Names): string {
  const parts: string[] = [];
  if (e.implique?.entree) parts.push(`Jets de ${n.entry(e.implique.entree)}`);
  if (e.implique?.attribut) parts.push(`Jets de ${n.attribute(e.implique.attribut)}`);
  if (!parts.length && e.actions?.length) parts.push(e.actions.map(n.action).join(', '));
  if (!parts.length) parts.push('Tous les jets');
  if (e.implique && e.actions?.length) parts.push(`(${e.actions.map(n.action).join(', ')})`);
  if (e.cote === 'cible') parts.push('en défense');
  return parts.join(' ');
}

function rollChange(e: RollEffect, n: Names): string {
  const a = e.ajout;
  if (!a) return 'modifié';
  if ('de' in a) return `${signedFormula(a.nombre)} ${n.die(a.de)}`;
  if ('ameliorer' in a) return `${plain(a.nombre)} ${n.die(a.ameliorer)} → ${n.die(a.vers)}`;
  if ('retrograder' in a) return `${plain(a.nombre)} ${n.die(a.retrograder)} ↘ ${n.die(a.vers)}`;
  if ('retirer' in a) return `−${plain(a.nombre)} ${n.die(a.retirer)}`;
  if ('variable' in a) return `${a.variable} ${signedFormula(a.ajouter)}`;
  return `${signedFormula(a.bonus)} au total`;
}

/** Description courte d'un effet, en français. */
export function describeEffect(e: Effet, n: Names): string {
  let s: string;
  switch (e.sur) {
    case 'attribut': {
      const name = n.attribute(e.attribut);
      const v = e.valeur;
      s =
        e.operation === 'ajouter'
          ? `${name} ${signedFormula(v)}`
          : e.operation === 'multiplier'
            ? `${name} ×${plain(v)}`
            : e.operation === 'fixer'
              ? `${name} = ${plain(v)}`
              : e.operation === 'minimum'
                ? `${name} ≥ ${plain(v)}`
                : `${name} ≤ ${plain(v)}`;
      break;
    }
    case 'rang':
      s = `${n.entry(e.entree)} ${signedFormula(e.valeur)} rang`;
      break;
    case 'marque':
      s = `${tagName(e.marque)} : ${e.entrees.map(n.entry).join(', ')}`;
      break;
    case 'jet':
      s = `${rollScope(e, n)} : ${rollChange(e, n)}`;
      break;
    case 'degats': {
      const types = e.types?.length ? ` (${e.types.map(n.damageType).join(', ')})` : '';
      s =
        e.operation === 'annuler'
          ? `Immunité aux dégâts${types}`
          : e.operation === 'multiplier'
            ? `Dégâts reçus ×${plain(e.valeur)}${types}`
            : `Dégâts reçus réduits de ${plain(e.valeur)}${types}`;
      break;
    }
  }
  return e.condition ? `${s} (si ${e.condition})` : s;
}

/**
 * Valeur réellement appliquée par une source sur un attribut, lue dans le
 * détail du calcul (`ignore` : effet écarté, famille non cumulable…).
 */
export function appliedOn(
  json: FicheJson,
  source: string,
  attribute: string,
): { valeur: number | string | boolean; ignore: boolean } | undefined {
  const line = json.valeurs[attribute]?.detail.find((l) => l.source === source);
  return line ? { valeur: line.valeur, ignore: !!line.ignore } : undefined;
}

// ─── Cibles proposées à l'ajout d'un bonus libre ─────────────────────────────

export interface OptionGroup<T> {
  label: string;
  options: T[];
}

const isNumeric = (a: Attribut) =>
  a.nature === 'base' ||
  a.nature === 'ressource' ||
  (a.nature === 'derivee' && a.type === 'nombre');

/** Attributs numériques du type d'entité, par groupe d'affichage. */
export function attributeGroups(
  system: SystemeCharge,
  type: string,
  filter: (a: Attribut) => boolean = isNumeric,
): OptionGroup<Attribut>[] {
  const entity = system.entites.get(type);
  if (!entity) return [];
  const all = [...entity.attributs.values()].filter((a) => a.visibilite !== 'mj' && filter(a));
  const groups: OptionGroup<Attribut>[] = [];
  for (const g of entity.type.groupes) {
    const options = all.filter((a) => a.groupe === g.id);
    if (options.length) groups.push({ label: g.nom, options });
  }
  const known = new Set(entity.type.groupes.map((g) => g.id));
  const rest = all.filter((a) => !a.groupe || !known.has(a.groupe));
  if (rest.length) groups.push({ label: groups.length ? 'Autres' : 'Attributs', options: rest });
  return groups;
}

function entryGroups(system: SystemeCharge, kinds: Sorte[]): OptionGroup<Entree>[] {
  return kinds.flatMap((k) => {
    const options = [...system.entrees.values()]
      .filter((e) => e.sorte === k.id)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return options.length ? [{ label: k.nomPluriel ?? k.nom, options }] : [];
  });
}

/** Entrées à rangs possédables par ce type (compétences, talents…). */
export function rankedEntryGroups(system: SystemeCharge, type: string): OptionGroup<Entree>[] {
  return entryGroups(
    system,
    [...system.sortes.values()].filter((s) => !!s.rangs && s.pour.includes(type)),
  );
}

/**
 * Entrées qu'un jet peut impliquer : sortes désignées par un paramètre
 * d'action (compétence, arme…) et sortes vers lesquelles renvoient leurs
 * champs (compétence d'une arme). Sans action, les sortes à rangs.
 */
export function rollEntryGroups(system: SystemeCharge, type: string): OptionGroup<Entree>[] {
  const ids = new Set<string>();
  for (const a of system.actions.values()) {
    if (!a.pour.includes(type)) continue;
    for (const p of a.parametres) if (p.type === 'entree') ids.add(p.sorte);
  }
  for (const id of [...ids]) {
    for (const c of system.sortes.get(id)?.champs ?? [])
      if (c.type === 'entree' || c.type === 'entrees') ids.add(c.sorte);
  }
  const kinds = ids.size
    ? [...ids].flatMap((id) => {
        const s = system.sortes.get(id);
        return s && s.pour.includes(type) ? [s] : [];
      })
    : [...system.sortes.values()].filter((s) => !!s.rangs && s.pour.includes(type));
  return entryGroups(system, kinds);
}

/** Attributs qu'un jet peut impliquer (caractéristique testée) : les attributs de base. */
export function rollAttributeGroups(system: SystemeCharge, type: string): OptionGroup<Attribut>[] {
  return attributeGroups(system, type, (a) => a.nature === 'base');
}

export type RollMode = 'bonus' | 'de';

/**
 * Façons de modifier un jet selon le système : bonus au total pour des jets
 * numériques, dé ajouté pour des pools de dés à symboles.
 */
export function rollModes(system: SystemeCharge, type: string): RollMode[] {
  const actions = [...system.actions.values()].filter((a) => a.pour.includes(type));
  const hasDice = !!system.source.des?.sortes.length;
  const modes: RollMode[] = [];
  if (actions.some((a) => a.jet.type === 'numerique') || (!actions.length && !hasDice))
    modes.push('bonus');
  if (hasDice && (actions.some((a) => a.jet.type === 'symboles') || !actions.length))
    modes.push('de');
  return modes.length ? modes : ['bonus'];
}
