import type {
  CharacterCreationRule,
  FormulaNode,
  ProfileDefinition,
  RaceDefinition,
  StatDefinition,
} from './types';

// Miroir de src/utils/characterTransfer.ts (mêmes conventions : exportVersion/exportedAt, blob +
// URL.createObjectURL pour le téléchargement, JSON.parse + validation manuelle pour l'import — aucune
// lib de validation externe dans le projet, on reste sur ce style pour rester cohérent).

const GAME_SYSTEM_EXPORT_VERSION = 1;

export interface GameSystemExportData {
  exportVersion: number;
  exportedAt: string;
  name: string;
  description: string;
  stats: StatDefinition[];
  creation?: CharacterCreationRule;
  combatDefenseKey?: string;
  combatAttackKeys?: string[];
  modifierFormula?: FormulaNode;
  statGroups?: string[];
  races: RaceDefinition[];
  profiles: ProfileDefinition[];
}

/** Source minimale requise pour construire un export — n'importe quel Draft (GameSystemManagerPanel)
 *  correspond à cette forme, mais ce module reste indépendant du composant d'édition. */
export interface GameSystemExportSource {
  name: string;
  description: string;
  stats: StatDefinition[];
  creation?: CharacterCreationRule;
  combatDefenseKey?: string;
  combatAttackKeys?: string[];
  modifierFormula?: FormulaNode;
  statGroups?: string[];
  races?: RaceDefinition[];
  profiles?: ProfileDefinition[];
}

/** systemId n'est jamais inclus dans l'export : un fichier partagé ne doit jamais forcer un identifiant
 *  qui pourrait entrer en collision avec un système existant d'une autre table — l'import régénère
 *  toujours son propre systemId côté appelant. */
export function buildGameSystemExport(source: GameSystemExportSource): GameSystemExportData {
  const result: GameSystemExportData = {
    exportVersion: GAME_SYSTEM_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    name: source.name,
    description: source.description,
    stats: source.stats,
    statGroups: source.statGroups ?? [],
    races: source.races ?? [],
    profiles: source.profiles ?? [],
  };
  if (source.creation != null) result.creation = source.creation;
  if (source.combatDefenseKey != null) result.combatDefenseKey = source.combatDefenseKey;
  if (source.combatAttackKeys != null) result.combatAttackKeys = source.combatAttackKeys;
  if (source.modifierFormula != null) result.modifierFormula = source.modifierFormula;
  return result;
}

/** Retire récursivement toute clé dont la valeur est `undefined` (objets et tableaux) — Firestore
 *  rejette `undefined` explicite n'importe où dans un document, y compris niché dans un tableau de
 *  stats/FormulaNode. Un champ jamais renseigné dans l'éditeur (ex modifierFormula) reste présent comme
 *  clé `undefined` en JS tant qu'il n'a pas été explicitement omis — nécessaire avant tout batch.set(). */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[key] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

export function downloadGameSystemExport(data: GameSystemExportData, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isStatDefinition(v: unknown): v is StatDefinition {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return typeof s.key === 'string' && typeof s.label === 'string' && typeof s.category === 'string' && typeof s.dataType === 'string';
}

export function parseGameSystemExport(raw: string): GameSystemExportData {
  const json = JSON.parse(raw);
  if (!json || typeof json !== 'object') {
    throw new Error('Fichier invalide : contenu JSON attendu.');
  }
  if (!Array.isArray(json.stats) || json.stats.length === 0 || !json.stats.every(isStatDefinition)) {
    throw new Error('Fichier invalide : aucune caractéristique valide trouvée.');
  }

  const result: GameSystemExportData = {
    exportVersion: typeof json.exportVersion === 'number' ? json.exportVersion : 1,
    exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : new Date().toISOString(),
    name: typeof json.name === 'string' ? json.name : '',
    description: typeof json.description === 'string' ? json.description : '',
    stats: json.stats,
    statGroups: Array.isArray(json.statGroups) ? json.statGroups : [],
    races: Array.isArray(json.races) ? json.races : [],
    profiles: Array.isArray(json.profiles) ? json.profiles : [],
  };
  // Champs optionnels : ajoutés seulement s'ils sont réellement présents dans le fichier — jamais
  // écrits comme `undefined` explicite (Firestore rejette toute clé dont la valeur est undefined).
  if (json.creation != null) result.creation = json.creation;
  if (typeof json.combatDefenseKey === 'string') result.combatDefenseKey = json.combatDefenseKey;
  if (Array.isArray(json.combatAttackKeys)) result.combatAttackKeys = json.combatAttackKeys;
  if (json.modifierFormula != null) result.modifierFormula = json.modifierFormula;
  return result;
}
