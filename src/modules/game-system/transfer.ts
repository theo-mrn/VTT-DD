import type {
  CharacterCreationRule,
  DicePoolUpgradeRule,
  FormulaNode,
  GameRuleEntry,
  LocationFieldDefinition,
  ProfileDefinition,
  RaceDefinition,
  SkillDefinition,
  StatDefinition,
  SymbolDieDefinition,
} from './types';

type GroupEntityCreationRule = { method: 'roll' | 'manual'; rollFormula?: FormulaNode };

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
  raceLabel?: string;
  profileLabel?: string;
  groupEntityLabel?: string;
  groupEntityStats: StatDefinition[];
  groupEntityCreation?: GroupEntityCreationRule;
  symbolDice: SymbolDieDefinition[];
  rules: GameRuleEntry[];
  locationLabel?: string;
  locationFields?: LocationFieldDefinition[];
  skills: SkillDefinition[];
  skillLabel?: string;
  startingXp?: number;
  diceUpgradeRule?: DicePoolUpgradeRule;
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
  raceLabel?: string;
  profileLabel?: string;
  groupEntityLabel?: string;
  groupEntityStats?: StatDefinition[];
  groupEntityCreation?: GroupEntityCreationRule;
  symbolDice?: SymbolDieDefinition[];
  rules?: GameRuleEntry[];
  locationLabel?: string;
  locationFields?: LocationFieldDefinition[];
  skills?: SkillDefinition[];
  skillLabel?: string;
  startingXp?: number;
  diceUpgradeRule?: DicePoolUpgradeRule;
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
    groupEntityStats: source.groupEntityStats ?? [],
    symbolDice: source.symbolDice ?? [],
    rules: source.rules ?? [],
    skills: source.skills ?? [],
  };
  if (source.creation != null) result.creation = source.creation;
  if (source.combatDefenseKey != null) result.combatDefenseKey = source.combatDefenseKey;
  if (source.combatAttackKeys != null) result.combatAttackKeys = source.combatAttackKeys;
  if (source.modifierFormula != null) result.modifierFormula = source.modifierFormula;
  if (source.raceLabel != null) result.raceLabel = source.raceLabel;
  if (source.profileLabel != null) result.profileLabel = source.profileLabel;
  if (source.groupEntityLabel != null) result.groupEntityLabel = source.groupEntityLabel;
  if (source.groupEntityCreation != null) result.groupEntityCreation = source.groupEntityCreation;
  if (source.locationLabel != null) result.locationLabel = source.locationLabel;
  if (source.locationFields != null) result.locationFields = source.locationFields;
  if (source.skillLabel != null) result.skillLabel = source.skillLabel;
  if (source.startingXp != null) result.startingXp = source.startingXp;
  if (source.diceUpgradeRule != null) result.diceUpgradeRule = source.diceUpgradeRule;
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

function isRaceDefinition(v: unknown): v is RaceDefinition {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.label === 'string'
    && !!r.modifiers && typeof r.modifiers === 'object' && !Array.isArray(r.modifiers)
    && Array.isArray(r.abilities);
}

function isSkillDefinition(v: unknown): v is SkillDefinition {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return typeof s.key === 'string' && typeof s.label === 'string' && typeof s.linkedStatKey === 'string';
}

export interface RacePackExportData {
  raceLabel?: string;
  races: RaceDefinition[];
}

/** Vrai si le JSON est un "pack de races" SEUL (races sans stats) — un export de système complet
 *  contient toujours `stats`, donc jamais confondu avec un pack. */
export function isRacePackExport(json: unknown): boolean {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
  const j = json as Record<string, unknown>;
  return Array.isArray(j.races) && !Array.isArray(j.stats);
}

/** Parse un fichier "pack de races" seul (ex race_star_wars.json) — permet d'importer/partager des
 *  espèces indépendamment du système de règles, dans la même logique modulaire que le reste. */
export function parseRacePackExport(raw: string): RacePackExportData {
  const json = JSON.parse(raw);
  if (!isRacePackExport(json)) {
    throw new Error('Fichier invalide : aucune liste de races trouvée.');
  }
  const races = (json.races as unknown[]).filter(isRaceDefinition) as RaceDefinition[];
  if (races.length === 0) {
    throw new Error('Fichier invalide : aucune race valide trouvée.');
  }
  const result: RacePackExportData = { races };
  if (typeof json.raceLabel === 'string') result.raceLabel = json.raceLabel;
  return result;
}

export function parseGameSystemExport(raw: string): GameSystemExportData {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Fichier invalide : contenu JSON attendu.');
  }
  // Tolère un fichier bundle (export du panneau Export/Import global, ex { gameSystem: {...}, ... })
  // déposé par erreur dans un import qui n'attend qu'un système seul : on déroule json.gameSystem
  // plutôt que de rejeter le fichier avec une erreur qui ne renseigne pas l'utilisateur sur la cause réelle.
  const json = (!Array.isArray(parsed.stats) && parsed.gameSystem && typeof parsed.gameSystem === 'object')
    ? parsed.gameSystem
    : parsed;
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
    groupEntityStats: Array.isArray(json.groupEntityStats) ? json.groupEntityStats : [],
    symbolDice: Array.isArray(json.symbolDice) ? json.symbolDice : [],
    rules: Array.isArray(json.rules) ? json.rules : [],
    skills: Array.isArray(json.skills) ? json.skills.filter(isSkillDefinition) : [],
  };
  // Champs optionnels : ajoutés seulement s'ils sont réellement présents dans le fichier — jamais
  // écrits comme `undefined` explicite (Firestore rejette toute clé dont la valeur est undefined).
  if (json.creation != null) result.creation = json.creation;
  if (typeof json.combatDefenseKey === 'string') result.combatDefenseKey = json.combatDefenseKey;
  if (Array.isArray(json.combatAttackKeys)) result.combatAttackKeys = json.combatAttackKeys;
  if (json.modifierFormula != null) result.modifierFormula = json.modifierFormula;
  if (typeof json.raceLabel === 'string') result.raceLabel = json.raceLabel;
  if (typeof json.profileLabel === 'string') result.profileLabel = json.profileLabel;
  if (typeof json.groupEntityLabel === 'string') result.groupEntityLabel = json.groupEntityLabel;
  if (json.groupEntityCreation != null) result.groupEntityCreation = json.groupEntityCreation;
  if (typeof json.locationLabel === 'string') result.locationLabel = json.locationLabel;
  if (Array.isArray(json.locationFields)) result.locationFields = json.locationFields;
  if (typeof json.skillLabel === 'string') result.skillLabel = json.skillLabel;
  if (typeof json.startingXp === 'number') result.startingXp = json.startingXp;
  if (json.diceUpgradeRule != null) result.diceUpgradeRule = json.diceUpgradeRule;
  return result;
}
