import { specializationPurchaseCost } from '../specializations';

describe('specializationPurchaseCost', () => {
  test('en carrière : 10 × total après achat', () => {
    expect(specializationPurchaseCost(2, false)).toBe(20);
    expect(specializationPurchaseCost(3, false)).toBe(30);
  });

  test('hors carrière d\'origine : +10 XP supplémentaires', () => {
    expect(specializationPurchaseCost(2, true)).toBe(30);
    expect(specializationPurchaseCost(1, true)).toBe(20);
  });

  test('première spécialisation supplémentaire (total=2, la 1ère gratuite ne compte pas ici car déjà possédée)', () => {
    expect(specializationPurchaseCost(2, false)).toBe(20);
  });
});
