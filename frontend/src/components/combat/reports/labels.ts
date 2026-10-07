/**
 * Mots des rapports, lus dans le système de la campagne (docs/combat.md § 3, principe 4) :
 * nom d'un attribut, d'une entrée, d'un type de dégâts, d'une table ; paramètres clés d'une
 * attaque (l'arme choisie…). Sans système chargé, les identifiants bruts sont montrés.
 */
import { translate } from '@/i18n/runtime';
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
  return a?.nom || key;
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

const VALUE_PATH = /^etat\.valeurs(?:\.([^.[\]]+)|\["?([^"\]]+)"?\])$/;

/** Chemin d'une fiche lisible : « PV » pour `etat.valeurs.PV`, sinon le chemin brut. */
export function pathLabel(systeme: SystemeCharge | null, path: string, entityType?: string | null) {
  const m = VALUE_PATH.exec(path);
  const key = m?.[1] ?? m?.[2];
  return key ? attributeLabel(systeme, key, entityType) : path;
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
    if (m.operation === 'remove') return translate('history.lines.without', { name });
    if (!m.duration) return name;
    return m.duration > 1 ? `${name}, ${m.duration} rounds` : `${name}, 1 round`;
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

// ─── Situation retenue (§ 5.7) ───────────────────────────────────────────────

/** Définition de paramètre lue sans supposer sa forme exacte (types à venir : `choix`). */
interface LooseParam {
  id: string;
  nom?: string;
  type?: string;
  section?: string;
  defaut?: unknown;
  sorte?: string;
  options?: unknown;
}

const isLooseParam = (p: unknown): p is LooseParam =>
  !!p && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string';

/**
 * Paramètres de situation d'une action : ceux de l'action rangés `section: situation`, puis
 * ceux que le système déclare pour toutes ses actions à cible (`situation`, à la racine ou sous
 * `combat`), s'il en déclare.
 */
export function situationParams(systeme: SystemeCharge | null, actionId: string): LooseParam[] {
  if (!systeme) return [];
  const own = (systeme.actions.get(actionId)?.parametres ?? []) as unknown[];
  const source = systeme.source as unknown as {
    situation?: unknown;
    combat?: { situation?: unknown };
  };
  const shared = source.situation ?? source.combat?.situation;
  const sharedList = sharedParams(shared);
  const out: LooseParam[] = [];
  const seen = new Set<string>();
  for (const p of own)
    if (isLooseParam(p) && p.section === 'situation' && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  for (const p of sharedList)
    if (isLooseParam(p) && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  return out;
}

/** Nom d'une option d'un paramètre `choix` (`{ valeur | id, nom }`), sinon la valeur. */
function optionName(p: LooseParam, value: string): string {
  const options = Array.isArray(p.options) ? (p.options as unknown[]) : [];
  for (const o of options) {
    if (!o || typeof o !== 'object') continue;
    const x = o as { valeur?: unknown; id?: unknown; nom?: unknown };
    if ((x.valeur ?? x.id) === value && typeof x.nom === 'string') return x.nom;
  }
  return value;
}

/**
 * Situation retenue pour une attaque, en mots : les paramètres de situation qui s'écartent de
 * leur défaut (« Couvert : partiel », « Avantage », « Bonus au toucher +2 »).
 */
export function situationText(
  systeme: SystemeCharge | null,
  actionId: string,
  params: ActionParams,
): string[] {
  return situationParams(systeme, actionId).flatMap((p) => {
    const v = params[p.id];
    if (v === undefined || v === null || v === p.defaut) return [];
    const name = p.nom ?? p.id;
    if (typeof v === 'boolean') return v ? [name] : [];
    if (typeof v === 'number' && v === 0) return [];
    if (typeof v === 'number') return [`${name} ${v > 0 ? '+' : '−'}${Math.abs(v)}`];
    if (typeof v !== 'string' || v === '') return [];
    if (p.type === 'entree') return [`${name} : ${entryName(systeme, v)}`];
    if (p.type === 'attribut') return [`${name} : ${attributeLabel(systeme, v)}`];
    return [`${name} : ${optionName(p, v)}`];
  });
}

/** Paramètres de situation partagés : une liste, ou un objet qui en porte une. */
function sharedParams(shared: unknown): unknown[] {
  if (Array.isArray(shared)) return shared;
  const parametres = (shared as { parametres?: unknown } | null | undefined)?.parametres;
  return typeof shared === 'object' && Array.isArray(parametres) ? parametres : [];
}
