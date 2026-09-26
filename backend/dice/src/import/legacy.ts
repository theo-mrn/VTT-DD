/**
 * Documents de l'ancienne app (Firestore) utiles aux dés, tels que les exporte
 * tools/firebase-export : une ligne NDJSON par document,
 * `{"path": "rolls/123456/rolls/abc", "id": "abc", "data": {...}}`, les types
 * Firestore étant balisés (`{"$timestamp": "…"}`). Les noms de collections et
 * de champs sont ceux de l'ancienne app : ils ne se traduisent pas.
 *
 * Formes déduites du code legacy (legacy/src) :
 *  - jet : `rolls/{code}/rolls/{id}`, écrit par components/(dices)/dice-roller.tsx
 *    et app/api/roll-dice/route.ts (FirebaseRoll) ; `{code}` est l'id du
 *    document `Salle/{code}` de la campagne ;
 *  - préférences : `users/{uid}.dice_skin` (skin choisi) et
 *    `users/{uid}.dice_inventory` (skins achetés ou gagnés ; absent :
 *    l'inventaire par défaut gold, silver, steampunk_copper) ;
 *  - nom affiché : `salles/{code}/Noms/{uid}.nom` (« MJ » ou nom du personnage),
 *    qui permet de retrouver l'auteur des anciens jets sans `uid`.
 */

/** Une ligne de l'export NDJSON. */
export interface FirestoreDoc<T = Record<string, unknown>> {
  path: string;
  id: string;
  data: T;
}

/** `rolls/{code}/rolls/{id}` (FirebaseRoll de dice-roller.tsx). */
export interface LegacyRoll {
  isPrivate?: boolean;
  isBlind?: boolean;
  diceCount?: number;
  diceFaces?: number;
  modifier?: number;
  results?: unknown;
  total?: unknown;
  userName?: string;
  userAvatar?: string;
  /** « Dice Roller », « Dice Roller/API ». */
  type?: string;
  /** Date.now() au moment du jet. */
  timestamp?: unknown;
  notation?: string;
  output?: string;
  persoId?: string;
  /** Présent sur les jets récents seulement. */
  uid?: string;
  symbolResult?: string;
  [key: string]: unknown;
}

/** `users/{uid}` (seuls les champs de dés). */
export interface LegacyUser {
  dice_skin?: unknown;
  dice_inventory?: unknown;
  [key: string]: unknown;
}

/** `salles/{code}/Noms/{uid}`. */
export interface LegacyName {
  nom?: string | null;
}

/** Texte d'un champ, ou undefined s'il est vide ou d'un autre type. */
export function toText(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Date d'un champ Firestore : millisecondes, `{$timestamp}` ou texte ISO. */
export function toDate(v: unknown): Date | undefined {
  let d: Date | undefined;
  if (typeof v === 'number' && Number.isFinite(v)) d = new Date(v);
  else if (typeof v === 'string') d = new Date(v);
  else if (
    v &&
    typeof v === 'object' &&
    typeof (v as { $timestamp?: unknown }).$timestamp === 'string'
  )
    d = new Date((v as { $timestamp: string }).$timestamp);
  return d && !Number.isNaN(d.getTime()) ? d : undefined;
}
