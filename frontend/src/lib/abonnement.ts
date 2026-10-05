/**
 * Abonnement premium, achats et factures (service billing, docs/paiement.md).
 * Le paiement se fait sur Stripe Checkout : les fonctions qui ouvrent une
 * session renvoient l'URL de Stripe, où le navigateur est envoyé.
 */
import { PAGES_FRONT } from '@vtt/contracts';
import { api } from './api';

export type Formule = 'monthly' | 'annual';

export type StatutAbonnement =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

/** GET /v1/billing/me */
export interface EtatAbonnement {
  /** Stripe configuré sur ce serveur (sinon paiements indisponibles). */
  configured: boolean;
  premium: boolean;
  premiumSource: 'subscription' | 'legacy' | 'gift' | 'purchase' | null;
  premiumSince: string | null;
  subscription: {
    plan: Formule | 'legacy';
    status: StatutAbonnement;
    currentPeriodEnd: string | null;
    /** Résilié : premium jusqu'à cette date. */
    cancelAt: string | null;
    /** Prélèvement en échec : carte à mettre à jour. */
    paymentIssue: boolean;
  } | null;
  hasCustomer: boolean;
}

/** GET /v1/billing/plans */
export interface Formules {
  currency: string;
  plans: { id: Formule; name: string; amount: number; interval: 'month' | 'year' }[];
}

export interface Facture {
  id: string;
  number: string | null;
  /** Secondes Unix. */
  date: number;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

export interface Achat {
  id: string;
  kind: 'dice' | 'token';
  itemId: string;
  name: string;
  amount: number;
  currency: string;
  status: 'completed' | 'refunded';
  completedAt: string;
  refundedAt: string | null;
}

/** GET /v1/billing/checkout/sessions/:id */
export interface EtatSession {
  status: 'pending' | 'completed' | 'expired';
  kind: 'premium' | 'dice' | 'token';
  itemId: string | null;
}

export const lireAbonnement = () => api<EtatAbonnement>('/v1/billing/me');
export const lireFormules = () => api<Formules>('/v1/billing/plans');
export const lireFactures = () =>
  api<{ invoices: Facture[] }>('/v1/billing/invoices').then((r) => r.invoices);
export const lireAchats = () =>
  api<{ purchases: Achat[] }>('/v1/billing/purchases').then((r) => r.purchases);
export const lireSession = (id: string) =>
  api<EtatSession>(`/v1/billing/checkout/sessions/${encodeURIComponent(id)}`);

/** Page actuelle (chemin relatif), où revenir après Stripe. */
export function pageActuelle() {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * Chemin de retour reçu dans l'URL : relatif au site seulement, jamais `//hôte`
 * ni URL absolue (aucune redirection vers un autre site).
 */
export function retourSur(brut: string | null, parDefaut: string = PAGES_FRONT.abonnement) {
  return brut && /^\/(?![/\\])[^\s\\]*$/.test(brut) ? brut : parDefaut;
}

const post = <T>(chemin: string, corps?: unknown) =>
  api<T>(chemin, {
    method: 'POST',
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });

/** Ouvre Stripe Checkout pour l'abonnement ; le navigateur quitte la page. */
export async function souscrire(plan: Formule, returnUrl = pageActuelle()) {
  const { url } = await post<{ url: string }>('/v1/billing/subscribe', { plan, returnUrl });
  window.location.assign(url);
}

/** Ouvre Stripe Checkout pour un skin (`bismuth`) ou un cadre (`token_Token3`). */
export async function acheter(itemId: string, returnUrl = pageActuelle()) {
  const { url } = await post<{ url: string }>('/v1/billing/checkout', { itemId, returnUrl });
  window.location.assign(url);
}

/** Portail client Stripe : carte bancaire, changement de formule, factures. */
export async function ouvrirPortail(returnUrl = pageActuelle()) {
  const { url } = await post<{ url: string }>('/v1/billing/portal', { returnUrl });
  window.location.assign(url);
}

export const resilier = () => post<{ cancelAt: string | null }>('/v1/billing/subscription/cancel');
export const reprendre = () => post<{ resumed: boolean }>('/v1/billing/subscription/resume');

/** Montant en centimes → « 4,99 € ». */
export function montant(centimes: number, devise = 'eur') {
  return (centimes / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: devise.toUpperCase(),
  });
}
