import { buildGameSystemExport, parseGameSystemExport, type GameSystemExportData, type GameSystemExportSource } from '@/modules/game-system/transfer';
import type { CharacterExportData } from '@/utils/characterTransfer';

// Miroir des conventions déjà en place dans game-system/transfer.ts et utils/characterTransfer.ts :
// exportVersion/exportedAt, blob + URL.createObjectURL pour le téléchargement, JSON.parse + validation
// manuelle pour l'import (aucune lib de validation externe dans le projet).

const ROOM_EXPORT_VERSION = 1;

export interface GroupEntitiesExportData {
  entityLabel: string;
  entities: Array<Record<string, unknown>>;
}

export interface RoomExportBundle {
  exportVersion: number;
  exportedAt: string;
  gameSystem?: GameSystemExportData;
  groupEntities?: GroupEntitiesExportData;
  characters?: CharacterExportData[];
}

export interface RoomExportBundleSource {
  gameSystem?: GameSystemExportSource;
  groupEntities?: GroupEntitiesExportData;
  characters?: CharacterExportData[];
}

/** N'ajoute une section que si elle a été fournie — jamais de clé `undefined` explicite (même règle
 *  que partout ailleurs dans le projet : Firestore/JSON.stringify n'aiment pas les clés undefined). */
export function buildRoomExportBundle(source: RoomExportBundleSource): RoomExportBundle {
  const result: RoomExportBundle = {
    exportVersion: ROOM_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
  };
  if (source.gameSystem != null) result.gameSystem = buildGameSystemExport(source.gameSystem);
  if (source.groupEntities != null) result.groupEntities = source.groupEntities;
  if (source.characters != null) result.characters = source.characters;
  return result;
}

export function downloadRoomExportBundle(bundle: RoomExportBundle, filename: string): void {
  const json = JSON.stringify(bundle, null, 2);
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

function isGroupEntitiesExportData(v: unknown): v is GroupEntitiesExportData {
  if (!v || typeof v !== 'object') return false;
  const g = v as Record<string, unknown>;
  return typeof g.entityLabel === 'string' && Array.isArray(g.entities);
}

function isCharacterExportData(v: unknown): v is CharacterExportData {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return !!c.character && typeof (c.character as Record<string, unknown>).Nomperso === 'string';
}

export function parseRoomExportBundle(raw: string): RoomExportBundle {
  const json = JSON.parse(raw);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Fichier invalide : contenu JSON attendu.');
  }

  const result: RoomExportBundle = {
    exportVersion: typeof json.exportVersion === 'number' ? json.exportVersion : 1,
    exportedAt: typeof json.exportedAt === 'string' ? json.exportedAt : new Date().toISOString(),
  };

  // gameSystem : réutilise parseGameSystemExport tel quel (mêmes règles de validation/retrocompat),
  // pas de duplication de la logique de validation des stats/races/profils. Tolère aussi un fichier
  // qui est un export système SEUL (pas enveloppé dans un bundle) déposé par erreur dans ce panneau —
  // parseGameSystemExport lève une erreur claire si stats est absent, sans jamais planter silencieusement.
  const gameSystemRaw = json.gameSystem ?? (Array.isArray(json.stats) ? json : null);
  if (gameSystemRaw != null) {
    result.gameSystem = parseGameSystemExport(JSON.stringify(gameSystemRaw));
  }

  if (isGroupEntitiesExportData(json.groupEntities)) {
    result.groupEntities = json.groupEntities;
  }

  if (Array.isArray(json.characters) && json.characters.every(isCharacterExportData)) {
    result.characters = json.characters;
  }

  return result;
}
