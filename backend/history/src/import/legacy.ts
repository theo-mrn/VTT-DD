/**
 * Documents de l'ancienne app (Firestore) utiles à l'historique, tels que les
 * exporte tools/firebase-export : une ligne NDJSON par document,
 * `{"path": "Historique/123456/events/abc", "id": "abc", "data": {...}}`, les
 * types Firestore étant balisés (`{"$timestamp": "…"}`). Les noms de
 * collections et de champs sont ceux de l'ancienne app : ils ne se traduisent pas.
 *
 * Formes déduites du code legacy (legacy/src) :
 *  - événement : `Historique/{code}/events/{id}`, écrit par
 *    lib/historiqueTrackerService.ts (logHistoryEvent, appelé à la main par la
 *    fiche, l'inventaire, le combat, la carte…) et components/Notes.tsx ;
 *    `{code}` est l'id du document `Salle/{code}` de la campagne ;
 *  - `targetUserId` : l'événement n'était montré qu'à cet utilisateur (notes
 *    privées, components/(historique)/Historique.tsx) ;
 *  - `details.hiddenFromTimeline` : masqué de la timeline, visible dans la vue
 *    par personnage (gardé tel quel dans la charge utile) ;
 *  - `Historique/{code}/summaries/{date}` : résumés IA, non importés ici.
 */

/** Une ligne de l'export NDJSON. */
export interface FirestoreDoc<T = Record<string, unknown>> {
  path: string;
  id: string;
  data: T;
}

/** `Historique/{code}/events/{id}` (GameEventPayload de historiqueTrackerService.ts). */
export interface LegacyHistoryEvent {
  /** creation, combat, mort, niveau, stats, inventaire, competence, note, deplacement, info. */
  type?: unknown;
  message?: unknown;
  characterId?: unknown;
  characterName?: unknown;
  characterAvatar?: unknown;
  characterType?: unknown;
  /** UID Firebase : seul cet utilisateur (et le MJ) voyait l'événement. */
  targetUserId?: unknown;
  details?: unknown;
  /** serverTimestamp() à l'écriture. */
  timestamp?: unknown;
  [key: string]: unknown;
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
