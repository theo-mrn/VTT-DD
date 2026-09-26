/**
 * Documents de l'ancienne app (Firestore) utiles aux salles, tels que les
 * exporte tools/firebase-export : une ligne NDJSON par document,
 * `{"path": "Salle/123456", "id": "123456", "data": {...}}`, les types
 * Firestore étant balisés (`{"$timestamp": "…"}`).
 *
 * Formes déduites du code legacy (legacy/src) :
 *  - salle : `Salle/{code}`, écrite par app/creer/page.tsx (et la route
 *    api/discord/create-room), modifiée par home/components/RoomSettingsManager
 *    et RoomUsersManager (`bannedUsers`) ;
 *  - sessions : `Salle/{code}/sessions/{id}` (home/components/RoomSessions.tsx) ;
 *  - discussion : `Salle/{code}/chat/{id}` (home/components/RoomChat.tsx). La
 *    discussion de la carte (`rooms/{code}/chat`) n'est pas celle de la salle ;
 *  - membres : `users/{uid}/rooms/{code}` (salles rejointes ou créées),
 *    `users/{uid}.room_id` (salle ouverte en dernier), et
 *    `salles/{code}/Noms/{uid}` : `nom` vaut « MJ » pour qui est entré comme
 *    MJ, sinon le `Nomperso` du personnage choisi (app/personnages/page.tsx) ;
 *  - personnage joué : `users/{uid}.persoId` (id du personnage dans
 *    `cartes/{room_id}/characters`), valable pour `room_id` seulement.
 */

/** Une ligne de l'export NDJSON. */
export interface DocFirestore<T = Record<string, unknown>> {
  path: string;
  id: string;
  data: T;
}

/** `Salle/{code}`. */
export interface SalleLegacy {
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
  [cle: string]: unknown;
}

/** `Salle/{code}/sessions/{id}`. */
export interface SessionLegacy {
  date?: unknown;
}

/** `Salle/{code}/chat/{id}`. */
export interface MessageLegacy {
  uid?: string;
  senderName?: string;
  text?: string;
  timestamp?: unknown;
}

/** `users/{uid}` (seuls les champs de salle). */
export interface UtilisateurLegacy {
  room_id?: string;
  persoId?: string | null;
  perso?: string | null;
  [cle: string]: unknown;
}

/** `salles/{code}/Noms/{uid}`. */
export interface NomLegacy {
  /** « MJ », `Nomperso` du personnage joué, ou null (personnage supprimé). */
  nom?: string | null;
}

/** `cartes/{code}/characters/{id}` (seuls les champs utiles aux salles). */
export interface PersonnageLegacy {
  Nomperso?: string;
  /** 'joueurs' pour un personnage joueur ; autre valeur (ou absent) pour un PNJ. */
  type?: string;
  [cle: string]: unknown;
}

/** Valeur de `salles/{code}/Noms/{uid}.nom` pour qui est entré comme MJ. */
export const NOM_MJ = 'MJ';

// ─── Lectures tolérantes ─────────────────────────────────────────────────────

/** Nombre fini, y compris écrit en chaîne ("12") ; `undefined` sinon. */
export function nombre(v: unknown): number | undefined {
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
export function texte(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/** Booléen, y compris écrit en chaîne ("true") ; `undefined` sinon. */
export function booleen(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

/** Date ISO d'un `{"$timestamp"}`, d'une chaîne ISO ou de millisecondes. */
export function dateIso(v: unknown): string | undefined {
  let brut: unknown = v;
  if (brut && typeof brut === 'object' && '$timestamp' in brut) {
    brut = (brut as { $timestamp: unknown }).$timestamp;
  }
  if (typeof brut === 'string') {
    const d = new Date(brut.replace(/(\.\d{3})\d+/, '$1'));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof brut === 'number' && Number.isFinite(brut) && brut > 0) {
    return new Date(brut).toISOString();
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
