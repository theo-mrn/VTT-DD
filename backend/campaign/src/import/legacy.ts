/**
 * Documents de l'ancienne app (Firestore) utiles aux campagnes, tels que les
 * exporte tools/firebase-export : une ligne NDJSON par document,
 * `{"path": "Salle/123456", "id": "123456", "data": {...}}`, les types
 * Firestore étant balisés (`{"$timestamp": "…"}`). Les noms de collections et
 * de champs sont ceux de l'ancienne app : ils ne se traduisent pas.
 *
 * Formes déduites du code legacy (legacy/src) :
 *  - campagne : `Salle/{code}`, écrite par app/creer/page.tsx (et la route
 *    api/discord/create-room), modifiée par home/components/RoomSettingsManager
 *    et RoomUsersManager (`bannedUsers`) ;
 *  - sessions : `Salle/{code}/sessions/{id}` (home/components/RoomSessions.tsx) ;
 *  - discussion : `Salle/{code}/chat/{id}` (home/components/RoomChat.tsx). La
 *    discussion de la carte (`rooms/{code}/chat`) n'est pas celle de la campagne ;
 *  - membres : `users/{uid}/rooms/{code}` (campagnes rejointes ou créées),
 *    `users/{uid}.room_id` (campagne ouverte en dernier), et
 *    `salles/{code}/Noms/{uid}` : `nom` vaut « MJ » pour qui est entré comme
 *    MJ, sinon le `Nomperso` du personnage choisi (app/personnages/page.tsx) ;
 *  - personnage joué : `users/{uid}.persoId` (id du personnage dans
 *    `cartes/{room_id}/characters`), valable pour `room_id` seulement.
 */

/** Une ligne de l'export NDJSON. */
export interface FirestoreDoc<T = Record<string, unknown>> {
  path: string;
  id: string;
  data: T;
}

/** `Salle/{code}`. */
export interface LegacyCampaign {
  title?: string;
  description?: string;
  maxPlayers?: number | string;
  /** URL Firebase Storage (`Salle/{code}/room-image`), vide pour les salles Discord. */
  imageUrl?: string;
  isPublic?: boolean;
  creatorId?: string;
  allowCharacterCreation?: boolean;
  bannedUsers?: string[];
  /** `dnd-classic`, id d'un document `gameSystems`, ou `custom_{code}`. Absent : D&D. */
  gameSystemId?: string;
  [key: string]: unknown;
}

/** `Salle/{code}/sessions/{id}`. */
export interface LegacySession {
  date?: unknown;
}

/** `Salle/{code}/chat/{id}`. */
export interface LegacyMessage {
  uid?: string;
  senderName?: string;
  text?: string;
  timestamp?: unknown;
}

/** `users/{uid}` (seuls les champs de campagne). */
export interface LegacyUser {
  room_id?: string;
  persoId?: string | null;
  perso?: string | null;
  [key: string]: unknown;
}

/** `salles/{code}/Noms/{uid}`. */
export interface LegacyName {
  /** « MJ », `Nomperso` du personnage joué, ou null (personnage supprimé). */
  nom?: string | null;
}

/** `cartes/{code}/characters/{id}` (seuls les champs utiles aux campagnes). */
export interface LegacyCharacter {
  Nomperso?: string;
  /** 'joueurs' pour un personnage joueur ; autre valeur (ou absent) pour un PNJ. */
  type?: string;
  [key: string]: unknown;
}

/** Valeur de `salles/{code}/Noms/{uid}.nom` pour qui est entré comme MJ. */
export const GM_NAME = 'MJ';

// ─── Lectures tolérantes ─────────────────────────────────────────────────────

/** Nombre fini, y compris écrit en chaîne ("12") ; `undefined` sinon. */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  if (v && typeof v === 'object' && '$number' in v) {
    const n = Number((v as { $number: unknown }).$number);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Chaîne non vide (espaces retirés), ou `undefined`. */
export function toText(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/** Booléen, y compris écrit en chaîne ("true") ; `undefined` sinon. */
export function toBoolean(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

/** Date ISO d'un `{"$timestamp"}`, d'une chaîne ISO ou de millisecondes. */
export function toIsoDate(v: unknown): string | undefined {
  let raw: unknown = v;
  if (raw && typeof raw === 'object' && '$timestamp' in raw) {
    raw = (raw as { $timestamp: unknown }).$timestamp;
  }
  if (typeof raw === 'string') {
    const d = new Date(raw.replace(/(\.\d{3})\d+/, '$1'));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return new Date(raw).toISOString();
  }
  return undefined;
}

/**
 * Identifiant comparable : minuscules, sans accents, mots séparés par « - »
 * (`Star Wars : Aux confins de l'Empire` → `star-wars-aux-confins-de-l-empire`).
 */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
