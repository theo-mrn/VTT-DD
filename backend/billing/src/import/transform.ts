/**
 * Conversion pure (sans base) d'un document `users/{uid}` de l'ancienne app
 * en client du service billing. Même règle du premium que l'import des dés
 * (backend/dice/src/import/transform.ts) : `premium: true` avec une échéance
 * absente, nulle ou future.
 */
import { toDate, toText, type FirestoreDoc, type LegacyUser } from './legacy.js';

export interface ImportedCustomer {
  uid: string;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  /** Premium en cours dans l'ancienne app. */
  premium: boolean;
  premiumSince: Date | null;
  cancelAtPeriodEnd: boolean;
  premiumEndDate: Date | null;
  warnings: string[];
}

const CUSTOMER = /^cus_[A-Za-z0-9]{1,250}$/;
const SUBSCRIPTION = /^sub_[A-Za-z0-9]{1,250}$/;

/**
 * Fin du premium : `premiumEndDate` en secondes Unix (le `cancelAt` de
 * Stripe), tolère des millisecondes ou une date Firestore. `null` : sans
 * échéance (absent, null ou 0) ; `undefined` : illisible.
 */
function premiumEnd(v: unknown): Date | null | undefined {
  if (v === undefined || v === null || v === 0) return null;
  if (typeof v === 'number')
    return Number.isFinite(v) ? new Date(v < 1e12 ? v * 1000 : v) : undefined;
  return toDate(v);
}

/**
 * Client billing d'un utilisateur de l'ancienne app ; `null` s'il n'a jamais
 * eu ni premium ni client Stripe.
 */
export function transformCustomer(
  doc: FirestoreDoc<LegacyUser>,
  now = Date.now(),
): ImportedCustomer | null {
  const d = doc.data ?? {};
  const warnings: string[] = [];

  const rawCustomer = toText(d.stripeCustomerId);
  const stripeCustomerId = rawCustomer && CUSTOMER.test(rawCustomer) ? rawCustomer : null;
  if (rawCustomer && !stripeCustomerId) warnings.push('Client Stripe illisible : ignoré');

  let premium = false;
  let end: Date | null = null;
  if (d.premium === true) {
    const e = premiumEnd(d.premiumEndDate);
    if (e === undefined) warnings.push('Échéance du premium illisible : premium ignoré');
    else if (e !== null && e.getTime() <= now)
      warnings.push(`Premium échu le ${e.toISOString()} : premium ignoré`);
    else {
      premium = true;
      end = e;
    }
  }
  if (!premium && !stripeCustomerId) return null;

  const rawSub = toText(d.stripeSubscriptionId);
  let subscriptionId: string | null = null;
  if (premium && rawSub) {
    if (SUBSCRIPTION.test(rawSub)) subscriptionId = rawSub;
    else warnings.push('Abonnement Stripe illisible : ignoré');
  }

  // Résiliation programmée : seulement avec sa date de fin (contrainte de la table)
  let cancelAtPeriodEnd = premium && d.cancelAtPeriodEnd === true;
  if (cancelAtPeriodEnd && !end) {
    warnings.push('Résiliation sans date de fin : ignorée');
    cancelAtPeriodEnd = false;
  }

  return {
    uid: doc.id,
    stripeCustomerId,
    subscriptionId,
    premium,
    premiumSince: premium ? (toDate(d.premiumSince) ?? null) : null,
    cancelAtPeriodEnd,
    premiumEndDate: cancelAtPeriodEnd ? end : null,
    warnings,
  };
}
