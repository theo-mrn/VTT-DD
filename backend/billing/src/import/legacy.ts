/**
 * Champs Stripe de l'ancienne app (Firestore), tels que les exporte
 * tools/firebase-export : une ligne NDJSON par document,
 * `{"path": "users/abc", "id": "abc", "data": {...}}`, les types Firestore
 * étant balisés (`{"$timestamp": "…"}`). Les noms de champs sont ceux de
 * l'ancienne app : ils ne se traduisent pas.
 *
 * Formes déduites du code legacy (legacy/src) :
 *  - app/api/stripe-webhook/route.ts écrit `premium: true`, `stripeCustomerId`,
 *    `stripeSubscriptionId`, `premiumSince` (ISO) à l'abonnement, et remet
 *    `premium: false`, `stripeSubscriptionId`, `cancelAtPeriodEnd`,
 *    `premiumEndDate` à null à la suppression de l'abonnement ;
 *  - components/profile/tabs/SubscriptionTab.tsx écrit, à la résiliation,
 *    `cancelAtPeriodEnd: true` et `premiumEndDate` (secondes Unix, le
 *    `cancelAt` de Stripe) ;
 *  - un premium peut aussi avoir été accordé à la main (sans client Stripe).
 */

/** Une ligne de l'export NDJSON. */
export interface FirestoreDoc<T = Record<string, unknown>> {
  path: string;
  id: string;
  data: T;
}

/** `users/{uid}` (seuls les champs de paiement). */
export interface LegacyUser {
  premium?: unknown;
  premiumSince?: unknown;
  stripeCustomerId?: unknown;
  stripeSubscriptionId?: unknown;
  cancelAtPeriodEnd?: unknown;
  /** Fin de l'abonnement résilié, en secondes Unix ; 0, null ou absent : sans échéance. */
  premiumEndDate?: unknown;
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
