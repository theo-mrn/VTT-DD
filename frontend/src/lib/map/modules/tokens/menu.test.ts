import { describe, expect, it } from 'vitest';
import type { MenuItem } from '../../engine/entities/entity-kind';
import { ALICE, character, setupTokens, token } from './test-kit';

const people = () => [
  character('hero', { name: 'Aria', side: 'players', kind: 'pc', ownerId: 'alice' }),
  character('gobelin', { name: 'Gobelin' }),
];
const players = [
  { id: 'hero', name: 'Aria' },
  { id: 'brom', name: 'Brom' },
];

const find = (items: readonly MenuItem[], id: string): MenuItem | undefined => {
  for (const i of items) {
    if (i.id === id) return i;
    const inner = i.children && find(i.children, id);
    if (inner) return inner;
  }
  return undefined;
};

function setup(viewer = undefined as typeof ALICE | undefined) {
  const t = setupTokens({
    tokens: [
      token('h1', 'hero', { pos: { x: 200, y: 200 } }),
      token('g1', 'gobelin', { pos: { x: 500, y: 500 } }),
      token('g2', 'gobelin', {
        pos: { x: 700, y: 700 },
        visibility: 'custom',
        visibleTo: ['hero'],
      }),
    ],
    characters: people(),
    players,
    ...(viewer ? { viewer } : {}),
  });
  const menu = (...ids: string[]) => {
    t.engine.selection.replace(ids);
    return t.engine.menuItems(ids, { x: 0, y: 0 });
  };
  return { ...t, menu };
}

describe('menu d’un token (MJ)', () => {
  it('actions communes, puis Fiche, Visibilité, Vision, Retirer de la carte', () => {
    const t = setup();
    const ids = t
      .menu('g1')
      .map((i) => i.id)
      .filter((id) => !id.startsWith('sep:'));
    expect(ids).toEqual([
      'inspect',
      'duplicate',
      'order',
      'layer',
      'delete',
      'token:sheet',
      'token:visibility',
      'token:vision',
      'token:remove-from-map',
    ]);
    // Un personnage joueur ne se duplique pas
    expect(t.menu('h1').some((i) => i.id === 'duplicate')).toBe(false);
  });

  it('Fiche ouvre le panneau de la fiche du personnage', () => {
    const t = setup();
    find(t.menu('g1'), 'token:sheet')!.run!();
    expect(t.tokens.library.getState().sheetFor).toBe('gobelin');
  });

  it('Visibilité ▸ : coche l’actuelle, change toute la sélection en une commande', async () => {
    const t = setup();
    const items = t.menu('g1');
    expect(find(items, 'token:visibility:visible')!.checked).toBe(true);
    expect(find(items, 'token:visibility:hidden')!.checked).toBe(false);
    find(t.menu('g1', 'h1'), 'token:visibility:hidden')!.run!();
    await t.commands.idle();
    expect(t.data('g1')!.visibility).toBe('hidden');
    expect(t.data('h1')!.visibility).toBe('hidden');
    expect(t.base.update).toHaveBeenCalledTimes(1);
    expect(t.commands.getSnapshot().undoLabel).toBe('Visibilité');
  });

  it('Pour certains joueurs ▸ : cocher ajoute, décocher retire, plus personne : invisible', async () => {
    const t = setup();
    const custom = find(t.menu('g2'), 'token:visibility:custom')!;
    expect(custom.children!.map((c) => [c.label, c.checked])).toEqual([
      ['Aria', true],
      ['Brom', false],
    ]);
    find(t.menu('g2'), 'token:visibility:custom:brom')!.run!();
    await t.commands.idle();
    expect(t.data('g2')).toMatchObject({ visibility: 'custom', visibleTo: ['hero', 'brom'] });
    find(t.menu('g2'), 'token:visibility:custom:hero')!.run!();
    find(t.menu('g2'), 'token:visibility:custom:brom')!.run!();
    await t.commands.idle();
    expect(t.data('g2')).toMatchObject({ visibility: 'invisible', visibleTo: [] });
    // Un token visible passe « pour certains » avec le personnage coché
    find(t.menu('g1'), 'token:visibility:custom:brom')!.run!();
    await t.commands.idle();
    expect(t.data('g1')).toMatchObject({ visibility: 'custom', visibleTo: ['brom'] });
  });

  it('Vision ▸ : rayon en cases (unité de la carte), vision augmentée', async () => {
    const t = setup();
    const vision = find(t.menu('g1'), 'token:vision')!;
    expect(vision.children!.map((c) => c.label)).toContain('6 m');
    expect(find(vision.children!, 'token:vision:2')!.checked).toBe(true); // 100 px = 2 cases
    find(vision.children!, 'token:vision:6')!.run!();
    find(t.menu('g1'), 'token:vision-boost')!.run!();
    await t.commands.idle();
    expect(t.data('g1')).toMatchObject({ visionRadius: 300, visionBoost: true });
  });

  it('Retirer de la carte : le personnage reste, annulable', async () => {
    const t = setup();
    find(t.menu('g1'), 'token:remove-from-map')!.run!();
    await t.commands.idle();
    expect(t.data('g1')).toBeUndefined();
    expect(t.base.remove).toHaveBeenCalledTimes(1);
    expect(t.api.removeWithCharacter).not.toHaveBeenCalled();
    await t.commands.undo();
    await t.commands.idle();
    expect(t.base.create).toHaveBeenCalledTimes(1);
  });
});

describe('menu d’un token (joueur)', () => {
  it('ses personnages : Fiche et Vision augmentée ; un PNJ : rien de propre', async () => {
    const t = setup(ALICE);
    const mine = t
      .menu('h1')
      .map((i) => i.id)
      .filter((id) => !id.startsWith('sep:'));
    expect(mine).toEqual(['inspect', 'token:sheet', 'token:vision-boost']);
    find(t.menu('h1'), 'token:vision-boost')!.run!();
    await t.commands.idle();
    expect(t.data('h1')!.visionBoost).toBe(true);
    expect(Object.keys(t.base.update.mock.calls[0]![0][0]!.changes)).toEqual(['visionBoost']);
    const npc = t.menu('g1').filter((i) => i.id.startsWith('token:'));
    expect(npc).toEqual([]);
  });
});
