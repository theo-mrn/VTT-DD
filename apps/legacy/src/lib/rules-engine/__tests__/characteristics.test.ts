import { statUpgradeCost, totalStatUpgradeCost, CREATION_STAT_MAX } from '../characteristics';

describe('statUpgradeCost', () => {
  test('coût = 10 × la valeur visée', () => {
    expect(statUpgradeCost(2)).toBe(20);
    expect(statUpgradeCost(4)).toBe(40);
    expect(statUpgradeCost(5)).toBe(50);
  });
});

describe('totalStatUpgradeCost', () => {
  test("l'exemple de l'énoncé : 3 → 5 = 40 + 50 = 90 XP", () => {
    expect(totalStatUpgradeCost(3, 5)).toBe(90);
  });

  test('un seul palier : 2 → 3 = 30 XP', () => {
    expect(totalStatUpgradeCost(2, 3)).toBe(30);
  });

  test('toValue <= fromValue => 0', () => {
    expect(totalStatUpgradeCost(3, 3)).toBe(0);
    expect(totalStatUpgradeCost(4, 2)).toBe(0);
  });
});

describe('CREATION_STAT_MAX', () => {
  test('plafond de création à 5', () => {
    expect(CREATION_STAT_MAX).toBe(5);
  });
});
