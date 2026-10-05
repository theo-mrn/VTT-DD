import { describe, expect, it } from 'vitest';
import { transitions } from './subscriptions.js';

const day = (n: number) => new Date(Date.UTC(2026, 9, n));
const active = {
  plan: 'monthly' as const,
  status: 'active' as const,
  cancelAt: null,
  currentPeriodEnd: day(30),
};
const types = (prev: Parameters<typeof transitions>[0], next: Parameters<typeof transitions>[1]) =>
  transitions(prev, next).map((t) => t.type.replace('billing.subscription_', ''));

describe('transitions d’un abonnement', () => {
  it('début : nouvel abonnement actif, ou paiement initial enfin réussi', () => {
    expect(types(undefined, active)).toEqual(['started']);
    expect(types({ ...active, status: 'incomplete' }, active)).toEqual(['started']);
    expect(types(undefined, { ...active, status: 'incomplete' })).toEqual([]);
  });

  it('résiliation programmée puis annulée ; changement de formule', () => {
    const canceling = { ...active, cancelAt: day(30) };
    expect(types(active, canceling)).toEqual(['cancellation_scheduled']);
    expect(types(canceling, canceling)).toEqual([]);
    expect(types(canceling, active)).toEqual(['resumed']);
    expect(types(active, { ...active, plan: 'annual' })).toEqual(['plan_changed']);
  });

  it('paiement en retard puis fin ; un état identique ne produit rien', () => {
    const pastDue = { ...active, status: 'past_due' as const };
    expect(types(active, pastDue)).toEqual(['past_due']);
    expect(types(pastDue, pastDue)).toEqual([]);
    expect(types(pastDue, { ...active, status: 'unpaid' })).toEqual(['ended']);
    expect(types(active, { ...active, status: 'canceled' })).toEqual(['ended']);
    expect(types({ ...active, status: 'canceled' }, { ...active, status: 'canceled' })).toEqual([]);
    expect(types(active, active)).toEqual([]);
  });
});
