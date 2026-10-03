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
  if (typeof v === 'number' && !Number.isFinite(v)) return undefined;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
  return toDate(v);
}

/** Client Stripe, s'il a la bonne forme. */
function customerIdOf(d: LegacyUser, warnings: string[]): string | null {
  const rawCustomer = toText(d.stripeCustomerId);
  const stripeCustomerId = rawCustomer && CUSTOMER.test(rawCustomer) ? rawCustomer : null;
  if (rawCustomer && !stripeCustomerId) warnings.push('Client Stripe illisible : ignoré');
  return stripeCustomerId;
}

/** Premium en cours : `premium: true` avec une échéance absente, nulle ou future. */
function activePremium(
  d: LegacyUser,
  now: number,
  warnings: string[],
): { premium: boolean; end: Date | null } {
  if (d.premium !== true) return { premium: false, end: null };
  const e = premiumEnd(d.premiumEndDate);
  if (e === undefined) {
    warnings.push('Échéance du premium illisible : premium ignoré');
    return { premium: false, end: null };
  }
  if (e !== null && e.getTime() <= now) {
    warnings.push(`Premium échu le ${e.toISOString()} : premium ignoré`);
    return { premium: false, end: null };
  }
  return { premium: true, end: e };
}

/** Abonnement Stripe d'un premium en cours, s'il a la bonne forme. */
function subscriptionIdOf(d: LegacyUser, premium: boolean, warnings: string[]): string | null {
  const rawSub = toText(d.stripeSubscriptionId);
  if (!premium || !rawSub) return null;
  if (SUBSCRIPTION.test(rawSub)) return rawSub;
  warnings.push('Abonnement Stripe illisible : ignoré');
  return null;
}

/** Résiliation programmée : seulement avec sa date de fin (contrainte de la table). */
function cancelsAtPeriodEnd(
  d: LegacyUser,
  premium: boolean,
  end: Date | null,
  warnings: string[],
): boolean {
  const cancelAtPeriodEnd = premium && d.cancelAtPeriodEnd === true;
  if (cancelAtPeriodEnd && !end) {
    warnings.push('Résiliation sans date de fin : ignorée');
    return false;
  }
  return cancelAtPeriodEnd;
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

  const stripeCustomerId = customerIdOf(d, warnings);
  const { premium, end } = activePremium(d, now, warnings);
  if (!premium && !stripeCustomerId) return null;
  const subscriptionId = subscriptionIdOf(d, premium, warnings);
  const cancelAtPeriodEnd = cancelsAtPeriodEnd(d, premium, end, warnings);

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
