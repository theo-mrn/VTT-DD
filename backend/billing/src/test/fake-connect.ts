/**
 * Faux Stripe Connect pour les tests : comptes des créateurs en mémoire, aucun appel réseau.
 * Un test change l'état d'un compte ici (`setState`), puis livre l'événement Connect (signé pour
 * de vrai) : le service relit le compte, comme avec le vrai Stripe.
 */
import Stripe from 'stripe';
import type { ConnectApi, ConnectState } from '../stripe/connect.js';
import { nextId } from './fake-stripe.js';

export const CONNECT_WEBHOOK_SECRET = 'whsec_test_connect_secret_0123456789';

const NEW_ACCOUNT: ConnectState = {
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  requirementsDue: 3,
};

export function fakeConnect() {
  const accounts = new Map<string, ConnectState>();
  const byKey = new Map<string, string>();
  const created: { userId: string; displayName: string; email: string | null }[] = [];
  const links: { accountId: string; refreshUrl: string; returnUrl: string }[] = [];

  const missing = () => Object.assign(new Error('No such account'), { code: 'resource_missing' });

  const api: ConnectApi = {
    async createAccount(r, idempotencyKey) {
      const known = byKey.get(idempotencyKey);
      if (known) return { id: known, state: accounts.get(known)! };
      const id = nextId('acct').replace('_test', '_1');
      accounts.set(id, { ...NEW_ACCOUNT });
      byKey.set(idempotencyKey, id);
      created.push(r);
      return { id, state: accounts.get(id)! };
    },
    async retrieveAccount(accountId) {
      const state = accounts.get(accountId);
      if (!state) throw missing();
      return state;
    },
    async onboardingLink(accountId, refreshUrl, returnUrl) {
      if (!accounts.has(accountId)) throw missing();
      links.push({ accountId, refreshUrl, returnUrl });
      return `https://connect.stripe.test/setup/${accountId}`;
    },
    async dashboardLink(accountId) {
      if (!accounts.has(accountId)) throw missing();
      return `https://connect.stripe.test/express/${accountId}`;
    },
  };

  return {
    api,
    accounts,
    created,
    links,
    /** Change l'état d'un compte chez (le faux) Stripe. */
    setState(accountId: string, patch: Partial<ConnectState>) {
      accounts.set(accountId, { ...accounts.get(accountId)!, ...patch });
    },
  };
}

/** Événement léger v2 d'un compte, signé comme le ferait Stripe pour l'endpoint Connect. */
export function signedAccountEvent(accountId: string, opts: { secret?: string } = {}) {
  const payload = JSON.stringify({
    id: nextId('evt'),
    object: 'v2.core.event',
    type: 'v2.core.account[configuration.merchant].capability_status_updated',
    created: new Date().toISOString(),
    livemode: false,
    related_object: {
      id: accountId,
      type: 'v2.core.account',
      url: `/v2/core/accounts/${accountId}`,
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? CONNECT_WEBHOOK_SECRET,
  });
  return {
    id: (JSON.parse(payload) as { id: string }).id,
    payload,
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
  };
}
