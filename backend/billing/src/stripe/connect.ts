/**
 * Stripe Connect pour la marketplace (docs/marketplace.md § 5.1), derrière une interface
 * minimale que les tests remplacent par un faux : aucun appel réseau en test.
 *
 * Comptes Accounts v2 (`/v2/core/accounts`), tableau de bord Express, configuration `merchant`
 * (paiements par carte et versements), frais et pertes à la charge de la plateforme.
 */
import type Stripe from 'stripe';
import { stripeClient } from './client.js';

/** État d'un compte connecté, tel que le service le garde. */
export interface ConnectState {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** Plus rien n'attend le créateur (informations, pièces). */
  detailsSubmitted: boolean;
  /** Exigences encore à fournir par le créateur. */
  requirementsDue: number;
}

export interface ConnectApi {
  /** Crée le compte Express d'un créateur ; rejoué avec la même clé, rend le même compte. */
  createAccount(
    r: { userId: string; displayName: string; email: string | null },
    idempotencyKey: string,
  ): Promise<{ id: string; state: ConnectState }>;
  retrieveAccount(accountId: string): Promise<ConnectState>;
  /** Lien d'onboarding hébergé par Stripe (à usage unique, quelques minutes). */
  onboardingLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<string>;
  /** Lien de connexion au tableau de bord Express (versements, factures). */
  dashboardLink(accountId: string): Promise<string>;
}

type V2Account = Stripe.V2.Core.Account;

/** État d'un compte v2 (capacités du marchand, exigences en attente du créateur). */
export function stateOfAccount(account: V2Account): ConnectState {
  const caps = account.configuration?.merchant?.capabilities;
  const entries = account.requirements?.entries ?? [];
  const due = entries.filter((e) => e.awaiting_action_from === 'user').length;
  return {
    chargesEnabled: caps?.card_payments?.status === 'active',
    payoutsEnabled: caps?.stripe_balance?.payouts?.status === 'active',
    detailsSubmitted: due === 0,
    requirementsDue: due,
  };
}

const INCLUDE: Stripe.V2.Core.AccountRetrieveParams.Include[] = [
  'configuration.merchant',
  'requirements',
];

export function connectApi(secretKey: string): ConnectApi {
  const stripe = stripeClient(secretKey);
  return {
    async createAccount(r, idempotencyKey) {
      const account = await stripe.v2.core.accounts.create(
        {
          display_name: r.displayName,
          ...(r.email ? { contact_email: r.email } : {}),
          dashboard: 'express',
          identity: { country: 'fr' },
          defaults: {
            currency: 'eur',
            locales: ['fr-FR'],
            responsibilities: { fees_collector: 'application', losses_collector: 'application' },
          },
          configuration: {
            merchant: { capabilities: { card_payments: { requested: true } } },
          },
          include: INCLUDE,
          metadata: { userId: r.userId },
        },
        { idempotencyKey },
      );
      return { id: account.id, state: stateOfAccount(account) };
    },
    async retrieveAccount(accountId) {
      return stateOfAccount(
        await stripe.v2.core.accounts.retrieve(accountId, { include: INCLUDE }),
      );
    },
    async onboardingLink(accountId, refreshUrl, returnUrl) {
      const link = await stripe.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            configurations: ['merchant'],
            refresh_url: refreshUrl,
            return_url: returnUrl,
          },
        },
      });
      return link.url;
    },
    async dashboardLink(accountId) {
      return (await stripe.accounts.createLoginLink(accountId)).url;
    },
  };
}

/**
 * Compte désigné par un événement de l'endpoint Connect, vérifié sur le corps brut : événement
 * léger v2 (`v2.core.account…`, `related_object`) ou instantané v1 (`account.updated`). null :
 * événement sans compte (ignoré).
 */
export function accountOfEvent(event: unknown): string | null {
  const e = (event ?? {}) as {
    object?: string;
    type?: string;
    related_object?: { id?: string; type?: string } | null;
    data?: { object?: { id?: string; object?: string } };
    account?: string;
  };
  if (e.object === 'v2.core.event') {
    const id = e.related_object?.id;
    return typeof id === 'string' && id.startsWith('acct_') ? id : null;
  }
  if (e.type === 'account.updated' || e.type === 'account.application.deauthorized') {
    const id = e.data?.object?.object === 'account' ? e.data.object.id : e.account;
    return typeof id === 'string' && id.startsWith('acct_') ? id : null;
  }
  return null;
}
