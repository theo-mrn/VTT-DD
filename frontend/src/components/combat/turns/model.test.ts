import type { CombatParticipant, CombatState } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import {
  currentActorOf,
  hiddenTurn,
  moveBy,
  myPendingInitiatives,
  myTurn,
  reorder,
  slotBar,
  slotCandidates,
  startCandidates,
  turnHeadline,
  turnRows,
} from './model';

const p = (characterId: string, extra: Partial<CombatParticipant> = {}): CombatParticipant => ({
  characterId,
  side: 'players',
  sortKeys: [],
  hasActed: false,
  ...extra,
});

const state = (extra: Partial<CombatState> = {}): CombatState => ({
  id: 'c1',
  round: 1,
  mode: 'individual',
  order: [],
  currentIndex: 0,
  initiativeRolled: true,
  version: 1,
  ...extra,
});

const names: Record<string, string> = { lyra: 'Lyra', orc: 'Orc', gob: 'Gobelin', kael: 'Kael' };
const nameOf = (id: string) => names[id] ?? id;

describe('tour courant', () => {
  it('lit currentActorId du serveur, sinon le participant de currentIndex', () => {
    const order = [p('lyra'), p('orc', { side: 'enemies' })];
    expect(currentActorOf(state({ order, currentIndex: 1 }))).toBe('orc');
    expect(currentActorOf(state({ order, currentIndex: 1, currentActorId: 'lyra' }))).toBe('lyra');
    expect(currentActorOf(state({ order, currentIndex: 1, currentActorId: null }))).toBeNull();
  });

  it('marque le tour courant, ceux qui ont agi, cachés et hors de combat', () => {
    const rows = turnRows(
      state({
        order: [
          p('lyra', { hasActed: true, sortKeys: [18], initiative: null }),
          p('orc', {
            side: 'enemies',
            visibleToPlayers: false,
            sortKeys: [12],
            initiative: {
              summary: '12 (d20 : 10 + 2)',
              params: {},
              source: 'server',
              rolledAt: '2026-09-30T10:00:00Z',
            },
          }),
          p('gob', { side: 'enemies', defeated: true, initiativePending: true }),
        ],
        currentIndex: 1,
      }),
    );
    expect(rows.map((r) => [r.position, r.current, r.acted, r.hidden, r.defeated])).toEqual([
      [1, false, true, false, false],
      [2, true, false, true, false],
      [3, false, false, false, true],
    ]);
    expect(rows[0]!.initiative).toBe('18');
    expect(rows[1]!.initiative).toBe('12 (d20 : 10 + 2)');
    expect(rows[2]!.initiative).toBeNull();
    expect(rows[2]!.pendingInitiative).toBe(true);
  });

  it('vue d’un joueur : tour d’un adversaire caché (currentIndex -1)', () => {
    const s = state({ order: [p('lyra')], currentIndex: -1, redacted: true });
    expect(hiddenTurn(s)).toBe(true);
    expect(currentActorOf(s)).toBeNull();
    expect(turnRows(s).some((r) => r.current)).toBe(false);
    expect(turnHeadline(s, nameOf)).toBe('Tour d’un adversaire');
  });

  it('titre du tour', () => {
    const order = [p('lyra'), p('orc', { side: 'enemies' })];
    expect(turnHeadline(state({ order, currentIndex: 0 }), nameOf)).toBe('Tour de Lyra');
    // -1 hors d'une vue expurgée : pas de tour, pas d'adversaire caché
    expect(turnHeadline(state({ order, initiativeRolled: false, currentIndex: -1 }), nameOf)).toBe(
      'Initiative à lancer',
    );
    expect(turnHeadline(state({ order: [], initiativeRolled: false }), nameOf)).toBe(
      'Initiative à lancer',
    );
  });
});

describe('créneaux (Star Wars)', () => {
  const order = [
    p('lyra', { hasActed: true }),
    p('orc', { side: 'enemies' }),
    p('kael'),
    p('gob', { side: 'enemies', defeated: true }),
  ];
  const slots = [
    { side: 'players' as const },
    { side: 'enemies' as const },
    { side: 'players' as const },
    { side: 'enemies' as const },
  ];

  it('barre des créneaux : le courant surligné, les passés marqués', () => {
    const bar = slotBar(state({ mode: 'slots', order, slots, currentIndex: 2 }));
    expect(bar.map((c) => [c.side, c.current, c.past])).toEqual([
      ['players', false, true],
      ['enemies', false, true],
      ['players', true, false],
      ['enemies', false, false],
    ]);
  });

  it('« Qui agit ? » : le camp du créneau, hors de combat exclus, acteur désigné', () => {
    const s = state({ mode: 'slots', order, slots, currentIndex: 2, currentActorId: 'kael' });
    expect(slotCandidates(s).map((c) => [c.characterId, c.acted, c.actor])).toEqual([
      ['lyra', true, false],
      ['kael', false, true],
    ]);
    const enemies = state({ mode: 'slots', order, slots, currentIndex: 1, currentActorId: null });
    expect(slotCandidates(enemies).map((c) => c.characterId)).toEqual(['orc']);
    expect(turnHeadline(enemies, nameOf)).toBe('Créneau des Ennemis');
    expect(turnHeadline(s, nameOf)).toBe('Créneau des Joueurs : Kael');
  });

  it('pas d’acteur déduit de currentIndex en mode slots', () => {
    const s = state({ mode: 'slots', order, slots, currentIndex: 0 });
    expect(currentActorOf(s)).toBeNull();
  });
});

describe('ce que peut faire un joueur', () => {
  const mine = new Set(['kael']);

  it('son tour en mode individuel', () => {
    const s = state({ order: [p('lyra'), p('kael')], currentIndex: 1 });
    expect(myTurn(s, mine)).toEqual({ kind: 'act', characterId: 'kael' });
    expect(myTurn(state({ order: [p('lyra'), p('kael')], currentIndex: 0 }), mine)).toBeNull();
    expect(myTurn(s, new Set())).toBeNull();
  });

  it('prendre le créneau de son camp s’il n’a pas agi et que personne n’est désigné', () => {
    const slots = [{ side: 'players' as const }, { side: 'enemies' as const }];
    const order = [p('lyra'), p('kael'), p('orc', { side: 'enemies' })];
    expect(myTurn(state({ mode: 'slots', order, slots, currentIndex: 0 }), mine)).toEqual({
      kind: 'slot',
      candidates: ['kael'],
    });
    // Créneau ennemi
    expect(myTurn(state({ mode: 'slots', order, slots, currentIndex: 1 }), mine)).toBeNull();
    // Déjà agi
    const acted = [p('lyra'), p('kael', { hasActed: true })];
    expect(myTurn(state({ mode: 'slots', order: acted, slots, currentIndex: 0 }), mine)).toBeNull();
    // Quelqu'un d'autre a pris le créneau
    expect(
      myTurn(state({ mode: 'slots', order, slots, currentIndex: 0, currentActorId: 'lyra' }), mine),
    ).toBeNull();
    // C'est moi qui l'ai pris
    expect(
      myTurn(state({ mode: 'slots', order, slots, currentIndex: 0, currentActorId: 'kael' }), mine),
    ).toEqual({ kind: 'act', characterId: 'kael' });
  });

  it('initiative demandée à mes personnages seulement', () => {
    const s = state({
      order: [p('lyra', { initiativePending: true }), p('kael', { initiativePending: true })],
    });
    expect(myPendingInitiatives(s, mine)).toEqual(['kael']);
  });
});

describe('réordonner', () => {
  it('déplace un participant à une place', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(reorder(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(reorder(['a', 'b', 'c'], 'x', 0)).toEqual(['a', 'b', 'c']);
  });

  it('monte ou descend d’un rang, rien au bord', () => {
    expect(moveBy(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveBy(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveBy(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(moveBy(['a', 'b', 'c'], 'c', 1)).toBeNull();
  });
});

describe('démarrer un combat', () => {
  it('présélectionne la scène, cache les PNJ cachés ou invisibles, écarte les créations', () => {
    const list = startCandidates(
      [
        { characterId: 'orc', side: 'enemies' },
        { characterId: 'lyra', side: 'players' },
        { characterId: 'gob', side: 'enemies' },
        { characterId: 'ally', side: 'allies' },
        { characterId: 'new', side: 'players', inCreation: true },
        { characterId: 'far', side: 'enemies' },
      ],
      [
        { characterId: 'lyra', visibility: 'visible' },
        { characterId: 'orc', visibility: 'visible' },
        { characterId: 'gob', visibility: 'invisible' },
        { characterId: 'ally', visibility: 'hidden' },
        { characterId: null },
      ],
    );
    expect(list.map((c) => [c.characterId, c.onScene, c.checked, c.hidden])).toEqual([
      ['lyra', true, true, false],
      ['orc', true, true, false],
      ['gob', true, true, true],
      ['ally', true, true, true],
      ['far', false, false, false],
    ]);
  });

  it('un personnage posé deux fois n’est caché que si tous ses tokens le sont', () => {
    const list = startCandidates(
      [{ characterId: 'orc', side: 'enemies' }],
      [
        { characterId: 'orc', visibility: 'hidden' },
        { characterId: 'orc', visibility: 'visible' },
      ],
    );
    expect(list[0]!.hidden).toBe(false);
  });

  it('un personnage joueur n’est jamais pré-caché', () => {
    const list = startCandidates(
      [{ characterId: 'lyra', side: 'players' }],
      [{ characterId: 'lyra', visibility: 'invisible' }],
    );
    expect(list[0]!.hidden).toBe(false);
  });
});
