import { describe as suite, expect, it } from 'vitest';
import { describe, diceSetOf, rollRequestOf, suggestions } from './dice-set.js';
import { apply, decodeTray, encodeTray, trayMessage } from './tray.js';
import type { GameSystem } from './yner.js';

const starWars: GameSystem = {
  systeme: {
    nom: 'Star Wars',
    des: {
      sortes: [
        { id: 'aptitude', nom: 'Aptitude' },
        { id: 'difficulte', nom: 'Difficulté' },
      ],
    },
  },
  presentation: {
    des: {
      sortes: {
        aptitude: { couleur: '#3fbf6a', court: 'Aptitude' },
        difficulte: { couleur: '#a065e0', court: 'Difficulté' },
      },
    },
  },
};

const dnd: GameSystem = {
  systeme: { nom: 'D&D classique', des: null },
  presentation: { des: { sortes: { d6: { couleur: '#c2956a' }, d20: { couleur: '#d0ad8b' } } } },
};

suite('dés d’un système', () => {
  it('système à symboles : les sortes du système, lancées en pool', () => {
    const set = diceSetOf('star-wars-eote', starWars);
    expect(set.kind).toBe('symbols');
    expect(set.dice.map((d) => d.id)).toEqual(['aptitude', 'difficulte']);
    expect(set.color).toBe(0x3fbf6a);
    const s = { counts: [2, 1], modifier: 0 };
    expect(describe(set, s)).toBe('2 Aptitude + 1 Difficulté');
    expect(rollRequestOf(set, s)).toEqual({
      pool: [
        { de: 'aptitude', nombre: 2 },
        { de: 'difficulte', nombre: 1 },
      ],
    });
  });

  it('système chiffré : les dés de la présentation, lancés en notation avec modificateur', () => {
    const set = diceSetOf('dnd-classic', dnd);
    expect(set.kind).toBe('numeric');
    expect(set.dice.map((d) => d.faces)).toEqual([6, 20]);
    expect(rollRequestOf(set, { counts: [0, 2], modifier: 3 })).toEqual({ notation: '2d20+3' });
    expect(rollRequestOf(set, { counts: [1, 1], modifier: -2 })).toEqual({
      notation: '1d6+1d20-2',
    });
    expect(describe(set, { counts: [1, 1], modifier: -2 })).toBe('1d6 + 1d20 - 2');
  });

  it('suggestions : le texte tapé, puis complété d’un dé de chaque sorte', () => {
    const set = diceSetOf('star-wars-eote', starWars);
    expect(suggestions(set, '')).toEqual(['1 Aptitude', '1 Difficulté']);
    expect(suggestions(set, '2 Aptitude +')).toEqual([
      '2 Aptitude',
      '2 Aptitude + 1 Aptitude',
      '2 Aptitude + 1 Difficulté',
    ]);
  });
});

suite('plateau de dés', () => {
  const set = diceSetOf('dnd-classic', dnd);

  it('l’état voyage dans le custom_id et se relit à l’identique', () => {
    const id = encodeTray({ kind: 'add', index: 1 }, 'dnd-classic', {
      counts: [0, 2],
      modifier: -3,
    });
    expect(id.length).toBeLessThanOrEqual(100);
    expect(decodeTray(id)).toEqual({
      action: { kind: 'add', index: 1 },
      systemId: 'dnd-classic',
      selection: { counts: [0, 2], modifier: -3 },
    });
    expect(decodeTray('tray:a1:dnd-classic:0.99:0')).toBeNull();
    expect(decodeTray('autre:roll:x:0:0')).toBeNull();
  });

  it('ajout, modificateur, vider', () => {
    const s = { counts: [0, 1], modifier: 0 };
    expect(
      apply(set, { action: { kind: 'add', index: 1 }, systemId: 'dnd-classic', selection: s }),
    ).toEqual({
      counts: [0, 2],
      modifier: 0,
    });
    expect(
      apply(set, { action: { kind: 'modifier', delta: -1 }, systemId: 'dnd-classic', selection: s })
        .modifier,
    ).toBe(-1);
    expect(
      apply(set, { action: { kind: 'clear' }, systemId: 'dnd-classic', selection: s }),
    ).toEqual({
      counts: [0, 0],
      modifier: 0,
    });
  });

  it('message : un bouton par dé, Lancer désactivé sans dé, custom_id uniques', () => {
    const vide = trayMessage(set, 'La Table');
    const boutons = vide.components!.flatMap((r) => r.components);
    expect(boutons.map((b) => b.label)).toEqual(['d6', 'd20', '−1', '+1', 'Vider', 'Lancer']);
    expect(boutons.find((b) => b.label === 'Lancer')!.disabled).toBe(true);
    expect(new Set(boutons.map((b) => b.custom_id)).size).toBe(boutons.length);
    const plein = trayMessage(set, 'La Table', { counts: [0, 2], modifier: 1 });
    expect(plein.content).toBe('**La Table** · 2d20 + 1');
    expect(
      plein.components!.flatMap((r) => r.components).find((b) => b.label === 'Lancer')!.disabled,
    ).toBe(false);
  });
});
