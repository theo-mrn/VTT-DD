import { resolveCharacterStats } from '@/lib/rules-engine';
import { dndClassicModule } from '../index';

// Vérifie que le module dnd-classic reproduit EXACTEMENT les formules actuelles :
// - getModifier(v) = floor((v-10)/2), CharacterContext.tsx ligne 182-184
// - Defense = 10 + mod(DEX), Contact = 1 + mod(FOR) + niveau, Distance = 1 + mod(DEX) + niveau,
//   Magie = 1 + max(mod(INT), mod(SAG), mod(CHA)) + niveau, INIT = DEX (app/creation/page.tsx lignes 151-156)
// - PV_Max = 1 + mod(CON) + jet du dé de vie

function mod(v: number) {
  return Math.floor((v - 10) / 2);
}

describe('dnd-classic module — parité avec les formules actuelles codées en dur', () => {
  // Nouveau personnage : PV_Max pas encore stocké -> la formule (avec jet de dé) est évaluée.
  // niveau: 1 reflète la réalité (app/creation/page.tsx initialise toujours niveau à 1) — Contact/
  // Distance/Magie retranchent 1 au niveau pour ne pas déjà donner de bonus à la création.
  const character = {
    FOR: 14, DEX: 12, CON: 16, SAG: 10, INT: 8, CHA: 13,
    deVie: 'd12',
    PV: 999,
    niveau: 1,
  };

  test('les modificateurs d\'abilities correspondent à floor((v-10)/2)', () => {
    const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], character);
    expect(resolved.modifiers.FOR).toBe(mod(14));
    expect(resolved.modifiers.DEX).toBe(mod(12));
    expect(resolved.modifiers.CON).toBe(mod(16));
    expect(resolved.modifiers.SAG).toBe(mod(10));
    expect(resolved.modifiers.INT).toBe(mod(8));
    expect(resolved.modifiers.CHA).toBe(mod(13));
  });

  test('Defense = 10 + mod(DEX)', () => {
    const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], character);
    expect(resolved.values.Defense).toBe(10 + mod(12));
  });

  test('Contact = 1 + mod(FOR), Distance = 1 + mod(DEX), Magie = 1 + mod(CHA) (CHA est le max mental ici) au niveau 1 (pas de bonus)', () => {
    const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], character);
    expect(resolved.values.Contact).toBe(1 + mod(14));
    expect(resolved.values.Distance).toBe(1 + mod(12));
    expect(resolved.values.Magie).toBe(1 + mod(13));
  });

  test('Contact/Distance/Magie ajoutent (niveau - 1) du personnage', () => {
    const leveledCharacter = { ...character, niveau: 4 };
    const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], leveledCharacter);
    expect(resolved.values.Contact).toBe(1 + mod(14) + 3);
    expect(resolved.values.Distance).toBe(1 + mod(12) + 3);
    expect(resolved.values.Magie).toBe(1 + mod(13) + 3);
  });

  test('Magie utilise la meilleure des trois caractéristiques mentales (INT, SAG, ou CHA), pas toujours CHA', () => {
    const wisdomCaster = { ...character, SAG: 18, CHA: 8 }; // mod(SAG=18)=4 > mod(CHA=8)=-1
    const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], wisdomCaster);
    expect(resolved.values.Magie).toBe(1 + mod(18));
  });

  test('INIT = DEX (valeur brute, pas de modificateur)', () => {
    const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], character);
    expect(resolved.values.INIT).toBe(12);
  });

  test('PV_Max = 1 + mod(CON) + jet du dé de vie (deVie="d12", jet borné [1,12])', () => {
    const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], character);
    const pvMax = Number(resolved.values.PV_Max);
    expect(pvMax).toBeGreaterThanOrEqual(1 + mod(16) + 1);
    expect(pvMax).toBeLessThanOrEqual(1 + mod(16) + 12);
  });

  test('PV (vital) absent démarre à sa valeur maximale (PV_Max), pas à 0', () => {
    const freshCharacter = { ...character, PV: undefined };
    const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], freshCharacter);
    expect(resolved.values.PV).toBe(resolved.values.PV_Max);
  });


  test('BUG RÉEL corrigé : PV stocké (39) sans PV_Max en base ne doit jamais être écrasé par un jet de dé aléatoire', () => {
    const legacyCharacter = { ...character, PV: 39 }; // PV_Max absent
    for (let i = 0; i < 20; i++) {
      expect(resolveCharacterStats(dndClassicModule.gameSystem, [], legacyCharacter).values.PV).toBe(39);
    }
  });

  test('bonus agrégés s\'appliquent aux stats dérivées de combat', () => {
    const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], character, { Contact: 3 });
    expect(resolved.values.Contact).toBe(1 + mod(14) + 3);
  });

  test('manifest déclare bien type game-system et les clés de combat', () => {
    expect(dndClassicModule.manifest.type).toBe('game-system');
    expect(dndClassicModule.gameSystem.combatDefenseKey).toBe('Defense');
    expect(dndClassicModule.gameSystem.combatAttackKeys).toEqual(['Contact', 'Distance', 'Magie']);
  });

  test('personnage existant : PV_Max déjà stocké en base -> jamais re-tiré au dé (figé, comportement actuel)', () => {
    const existingCharacter = { ...character, PV_Max: 12 };
    for (let i = 0; i < 20; i++) {
      const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], existingCharacter);
      expect(resolved.values.PV_Max).toBe(12);
    }
  });

  test('personnage existant avec bonus : PV_Max stocké + bonus, toujours sans re-tirer le dé', () => {
    const existingCharacter = { ...character, PV_Max: 12 };
    const resolved = resolveCharacterStats(dndClassicModule.gameSystem, [], existingCharacter, { PV_Max: 2 });
    expect(resolved.values.PV_Max).toBe(14);
  });
});
