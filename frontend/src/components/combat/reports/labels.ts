/**
 * Mots des rapports, lus dans le système de la campagne (docs/combat.md § 3, principe 4) :
 * nom d'un attribut, d'une entrée, d'un type de dégâts, d'une table ; paramètres clés d'une
 * attaque (l'arme choisie…). Sans système chargé, les identifiants bruts sont montrés.
 */
import type { ActionParams, AttackModificationInput, AttackRoll } from '@vtt/contracts';
import type { Attribut, SystemeCharge } from '@vtt/rules';

export function attributeOf(
  systeme: SystemeCharge | null,
  key: string,
  entityType?: string | null,
): Attribut | null {
  if (!systeme) return null;
  const own = entityType ? systeme.entites.get(entityType) : undefined;
  for (const entity of own ? [own] : systeme.entites.values()) {
    const a = entity.type.attributs.find((x) => x.cle === key);
    if (a) return a;
  }
  return null;
}

export function attributeLabel(
  systeme: SystemeCharge | null,
  key: string,
  entityType?: string | null,
) {
  const a = attributeOf(systeme, key, entityType);
  return a?.abrege || a?.nom || key;
}

export function entryName(systeme: SystemeCharge | null, id: string) {
  return systeme?.entrees.get(id.split('#')[0]!)?.nom ?? id;
}

export function damageTypeName(systeme: SystemeCharge | null, id: string) {
  return systeme?.source.typesDegats.find((t) => t.id === id)?.nom ?? id;
}

/** Sorte d'un dé à symboles (Aptitude, Difficulté…). */
export function dieName(systeme: SystemeCharge | null, id: string) {
  return systeme?.source.des?.sortes.find((d) => d.id === id)?.nom ?? id;
}

export function tableName(systeme: SystemeCharge | null, id: string) {
  return systeme?.tables.get(id)?.nom ?? id;
}

/** Types de dégâts déclarés par le système. */
export function damageTypes(systeme: SystemeCharge | null) {
  return systeme?.source.typesDegats ?? [];
}

const SIGN = { add: '+', subtract: '−', set: '= ' } as const;

/** « −7 PV (feu) », « Brûlé, 2 rounds », « sans Étourdi ». */
export function modificationText(
  systeme: SystemeCharge | null,
  m: AttackModificationInput,
  entityType?: string | null,
): string {
  if (m.kind === 'entry') {
    const name = entryName(systeme, m.entry);
    if (m.operation === 'remove') return `sans ${name}`;
    return m.duration ? `${name}, ${m.duration} round${m.duration > 1 ? 's' : ''}` : name;
  }
  const type = m.damageType ? ` (${damageTypeName(systeme, m.damageType)})` : '';
  return `${SIGN[m.operation]}${m.value} ${attributeLabel(systeme, m.attribute, entityType)}${type}`;
}

/** Paramètres clés d'une attaque : les entrées choisies (arme, compétence) par leur nom. */
export function keyParams(systeme: SystemeCharge | null, actionId: string, params: ActionParams) {
  const action = systeme?.actions.get(actionId);
  if (!action) return [];
  return action.parametres.flatMap((p) => {
    const v = params[p.id];
    if (p.type === 'entree' && typeof v === 'string' && v) return [entryName(systeme, v)];
    if (p.type === 'booleen' && v === true) return [p.nom];
    return [];
  });
}

/** Résumé d'un jet : total numérique, ou résultats nets du pool (noms du système). */
export function rollSummary(systeme: SystemeCharge | null, roll: AttackRoll | null): string | null {
  if (!roll) return null;
  if (roll.kind === 'numeric') return String(roll.total);
  const declared = systeme?.source.des?.resultats ?? [];
  const parts = declared.length
    ? declared
        .filter((d) => d.visible !== false && (roll.results[d.cle] ?? 0) > 0)
        .map((d) => `${roll.results[d.cle]} ${d.nom.toLowerCase()}`)
    : Object.entries(roll.results)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${v} ${k}`);
  return parts.length ? parts.join(', ') : 'aucun symbole net';
}
