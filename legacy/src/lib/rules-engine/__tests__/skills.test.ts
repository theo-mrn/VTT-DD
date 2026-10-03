import { skillUpgradeCost, totalSkillUpgradeCost, isCareerSkillForCharacter } from '../skills';

describe('skillUpgradeCost', () => {
  test('compétence de carrière : 5 × rang visé (0→1 = 5, 1→2 = 10)', () => {
    expect(skillUpgradeCost(1, true)).toBe(5);
    expect(skillUpgradeCost(2, true)).toBe(10);
    expect(skillUpgradeCost(5, true)).toBe(25);
  });

  test('compétence hors-carrière : (5 × rang visé) + 5 (0→1 = 10, 1→2 = 15)', () => {
    expect(skillUpgradeCost(1, false)).toBe(10);
    expect(skillUpgradeCost(2, false)).toBe(15);
    expect(skillUpgradeCost(5, false)).toBe(30);
  });
});

describe('totalSkillUpgradeCost', () => {
  test('somme des paliers intermédiaires, carrière', () => {
    expect(totalSkillUpgradeCost(0, 2, true)).toBe(5 + 10);
    expect(totalSkillUpgradeCost(0, 1, true)).toBe(5);
  });

  test('somme des paliers intermédiaires, hors-carrière', () => {
    expect(totalSkillUpgradeCost(0, 2, false)).toBe(10 + 15);
  });

  test('fromRank === toRank => 0', () => {
    expect(totalSkillUpgradeCost(2, 2, true)).toBe(0);
  });
});

describe('isCareerSkillForCharacter', () => {
  test('vrai si la clé est dans careerSkillKeys du Profil', () => {
    expect(isCareerSkillForCharacter('discretion', ['discretion', 'pilotage'], [])).toBe(true);
  });

  test('vrai si la clé est dans grantedSkillKeys d\'une spécialisation possédée', () => {
    expect(isCareerSkillForCharacter('astrogation', ['discretion'], [{ grantedSkillKeys: ['astrogation'] }])).toBe(true);
  });

  test('faux si la clé n\'apparaît nulle part', () => {
    expect(isCareerSkillForCharacter('mecanique', ['discretion'], [{ grantedSkillKeys: ['astrogation'] }])).toBe(false);
  });
});
