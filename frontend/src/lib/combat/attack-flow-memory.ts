/**
 * Dernière attaque de chaque personnage (nouveauté du menu, docs/combat.md § 12.1) : l'action
 * et ses paramètres (l'arme choisie…) sont gardés dans ce navigateur et repris à la prochaine
 * ouverture du menu pour ce personnage, marqués « Dernière » sur sa carte.
 *
 * Rien de secret : des identifiants d'action et de paramètres du système. Le stockage peut
 * manquer ou refuser d'écrire (navigation privée) : on s'en passe, sans erreur.
 */
import type { ActionParams } from '@vtt/contracts';

export interface AttackMemory {
  actionId: string;
  params: ActionParams;
  /** Horodatage (ms), pour ne garder que les plus récentes. */
  at: number;
}

export interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const ATTACK_MEMORY_KEY = 'vtt:combat:derniere-attaque';
/** Personnages gardés au plus (les plus récents). */
export const ATTACK_MEMORY_MAX = 60;

type Book = Record<string, AttackMemory>;

const keyOf = (campaignId: string, characterId: string) => `${campaignId}:${characterId}`;

function read(storage: MemoryStorage): Book {
  try {
    const raw = storage.getItem(ATTACK_MEMORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Book) : {};
  } catch {
    return {};
  }
}

const isParams = (v: unknown): v is ActionParams =>
  Boolean(v) &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.values(v as object).every(
    (x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean',
  );

/** Dernière attaque de ce personnage dans cette campagne, si elle est lisible. */
export function recallAttack(
  storage: MemoryStorage | null,
  campaignId: string,
  characterId: string | null,
): AttackMemory | null {
  if (!storage || !characterId) return null;
  const m = read(storage)[keyOf(campaignId, characterId)];
  if (!m || typeof m.actionId !== 'string' || !isParams(m.params)) return null;
  return { actionId: m.actionId, params: m.params, at: typeof m.at === 'number' ? m.at : 0 };
}

/** Garde l'attaque déclarée pour ce personnage (les plus anciennes s'effacent). */
export function rememberAttack(
  storage: MemoryStorage | null,
  campaignId: string,
  characterId: string,
  memory: { actionId: string; params: ActionParams },
  now: number = Date.now(),
) {
  if (!storage) return;
  const book = read(storage);
  book[keyOf(campaignId, characterId)] = { ...memory, at: now };
  const kept = Object.entries(book)
    .sort(([, a], [, b]) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, ATTACK_MEMORY_MAX);
  try {
    storage.setItem(ATTACK_MEMORY_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Stockage plein ou refusé : la mémoire est un confort, pas une donnée
  }
}

/** Stockage du navigateur, s'il est disponible. */
export function browserMemory(): MemoryStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
