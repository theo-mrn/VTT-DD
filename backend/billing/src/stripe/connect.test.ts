import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { accountOfEvent, stateOfAccount } from './connect.js';

const account = (patch: Record<string, unknown>) => patch as unknown as Stripe.V2.Core.Account;

describe('état d’un compte connecté (Accounts v2)', () => {
  it('actif : paiements par carte et versements actifs, rien n’attend le créateur', () => {
    expect(
      stateOfAccount(
        account({
          configuration: {
            merchant: {
              capabilities: {
                card_payments: { status: 'active' },
                stripe_balance: { payouts: { status: 'active' } },
              },
            },
          },
          requirements: { entries: [{ awaiting_action_from: 'stripe' }] },
        }),
      ),
    ).toEqual({
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsDue: 0,
    });
  });

  it('en cours : exigences en attente du créateur, capacités absentes', () => {
    expect(
      stateOfAccount(
        account({
          requirements: {
            entries: [{ awaiting_action_from: 'user' }, { awaiting_action_from: 'user' }],
          },
        }),
      ),
    ).toEqual({
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: 2,
    });
  });
});

describe('compte désigné par un événement Connect', () => {
  it('événement léger v2 ou instantané v1', () => {
    expect(
      accountOfEvent({
        object: 'v2.core.event',
        type: 'v2.core.account.updated',
        related_object: { id: 'acct_1abc', type: 'v2.core.account' },
      }),
    ).toBe('acct_1abc');
    expect(
      accountOfEvent({
        object: 'event',
        type: 'account.updated',
        data: { object: { id: 'acct_2xyz', object: 'account' } },
      }),
    ).toBe('acct_2xyz');
  });

  it('rien pour un autre événement ou un objet inattendu', () => {
    expect(accountOfEvent({ object: 'event', type: 'charge.refunded' })).toBeNull();
    expect(
      accountOfEvent({ object: 'v2.core.event', related_object: { id: 'cus_1', type: 'x' } }),
    ).toBeNull();
    expect(accountOfEvent(null)).toBeNull();
  });
});
