// Vérifie que buildCharacterVariables() — désormais un thin wrapper autour du moteur de règles
// partagé (src/lib/rules-engine) — produit les mêmes variables que l'ancienne implémentation
// dupliquée (MODIFIER_STATS/DIRECT_STATS codés en dur), pour un personnage dnd-classic typique.

// niveau: 1 reflète un personnage réel (toujours initialisé à la création) — Contact/Distance/Magie
// sont des stats 'derived' recalculées en direct depuis leur formule (1 + mod(carac) + (niveau-1)),
// jamais lues brutes depuis Defense/Contact/Distance/Magie ci-dessous une fois stockées.
const mockCharacterData = {
  FOR: 14, DEX: 12, CON: 16, SAG: 10, INT: 8, CHA: 13,
  niveau: 1,
  Defense: 11, Contact: 3, Distance: 3, Magie: 2, INIT: 12,
  deVie: 'd12', PV_Max: 12, PV: 12,
};

const mockUserData = { room_id: 'room1', persoId: 'perso1' };

jest.mock('../lib/firebase-admin', () => ({
  adminDb: {
    doc: jest.fn((path: string) => ({
      get: jest.fn().mockResolvedValue(
        path === 'users/uid1'
          ? { exists: true, data: () => mockUserData }
          : path === 'cartes/room1/characters/perso1'
            ? { exists: true, data: () => mockCharacterData }
            : { exists: false, data: () => ({}) }
      ),
    })),
  },
}));

import { buildCharacterVariables } from '@/lib/character-variables';

function mod(v: number) {
  return Math.floor((v - 10) / 2);
}

describe('buildCharacterVariables (wrapper sur le moteur de règles)', () => {
  it('produit les modificateurs des abilities et les valeurs directes des stats de combat', async () => {
    const vars = await buildCharacterVariables('uid1');
    expect(vars.FOR).toBe(mod(14));
    expect(vars.DEX).toBe(mod(12));
    expect(vars.Defense).toBe(10 + mod(12));
    expect(vars.Contact).toBe(3);
    expect(vars.INIT).toBe(12);
  });

  it('retourne un objet vide si le user ou le personnage est introuvable', async () => {
    const vars = await buildCharacterVariables('uid-inconnu');
    expect(vars).toEqual({});
  });
});
