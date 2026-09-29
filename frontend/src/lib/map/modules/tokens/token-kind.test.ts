import { describe, expect, it } from 'vitest';
import { hasCapability } from '../../engine/entities/entity-kind';
import { ALICE, character, setupTokens, token } from './test-kit';

const hero = () => token('h1', 'hero', { pos: { x: 200, y: 200 } });
const goblin = () => token('g1', 'gobelin', { pos: { x: 500, y: 500 } });
const people = () => [
  character('hero', { name: 'Aria', side: 'players', kind: 'pc', ownerId: 'alice' }),
  character('gobelin', { name: 'Gobelin' }),
];

describe('sorte token : capacités et rangement', () => {
  it('déclare ses capacités, son calque par défaut et sa famille d’affichage', () => {
    const t = setupTokens({ tokens: [goblin()], characters: people() });
    const kind = t.kind();
    for (const cap of [
      'select',
      'move',
      'resize',
      'duplicate',
      'delete',
      'inspect',
      'order',
    ] as const)
      expect(hasCapability(kind, cap)).toBe(true);
    // Visibilité et « visible pour » : menu propre (Visibilité ▸), pas d'action commune
    expect(hasCapability(kind, 'hide')).toBe(false);
    expect(hasCapability(kind, 'rotate')).toBe(false);
    expect(kind.stacking?.defaultRole).toBe('tokens');
    expect(kind.display).toBe('characters');
    const e = t.entity('g1');
    expect(e.plane).toBe('content');
    expect(e.layerId).toBe('personnages');
    expect(e.geometry).toMatchObject({ x: 500, y: 500, width: 50, height: 50 });
  });

  it('invisible : masqué aux joueurs (hachures du MJ)', () => {
    const t = setupTokens({
      tokens: [goblin(), token('g2', 'gobelin', { visibility: 'invisible' })],
    });
    expect(t.entity('g1').state.hiddenForPlayers).toBe(false);
    expect(t.entity('g2').state.hiddenForPlayers).toBe(true);
  });

  it('nom : annuaire, sinon brouillon de la pose', () => {
    const t = setupTokens({
      tokens: [
        goblin(),
        token('tmp-1', 'draft:x', { draft: { name: 'Orque', imageUrl: null, side: 'enemies' } }),
      ],
      characters: people(),
    });
    const kind = t.kind();
    const ctx = t.engine.kindContext();
    expect(kind.name?.(t.data('g1')!, ctx)).toBe('Gobelin');
    expect(kind.name?.(t.data('tmp-1')!, ctx)).toBe('Orque');
  });

  it('toucher : le coin d’un token rond ne le touche pas', () => {
    const t = setupTokens({ tokens: [goblin()], characters: people() });
    expect(t.engine.hitTest({ x: 500, y: 500 })?.id).toBe('g1');
    expect(t.engine.hitTest({ x: 523, y: 523 })).toBeNull();
    const square = setupTokens({ tokens: [token('s', 'gobelin', { shape: 'square' })] });
    expect(square.engine.hitTest({ x: 523, y: 523 })?.id).toBe('s');
  });
});

describe('sorte token : droits du joueur', () => {
  it('un joueur glisse son personnage (une commande /tokens/move : pos seulement)', async () => {
    const t = setupTokens({ tokens: [hero(), goblin()], characters: people(), viewer: ALICE });
    t.drag({ x: 200, y: 200 }, { x: 300, y: 260 });
    await t.commands.idle();
    expect(t.base.update).toHaveBeenCalledTimes(1);
    const [updates] = t.base.update.mock.calls[0]!;
    expect(Object.keys(updates[0]!.changes)).toEqual(['pos']);
    expect(t.data('h1')!.pos).toEqual({ x: 325, y: 275 });
  });

  it('un joueur ne déplace pas un PNJ, ne le supprime pas', async () => {
    const t = setupTokens({ tokens: [hero(), goblin()], characters: people(), viewer: ALICE });
    t.drag({ x: 500, y: 500 }, { x: 600, y: 600 });
    await t.commands.idle();
    expect(t.base.update).not.toHaveBeenCalled();
    expect(t.data('g1')!.pos).toEqual({ x: 500, y: 500 });
    expect(await t.engine.deleteEntities([t.entity('g1')])).toBe(false);
    expect(t.engine.movableSelection(t.entity('h1'))).toEqual([]);
    t.engine.selection.replace(['h1']);
    expect(t.engine.movableSelection(t.entity('h1')).map((e) => e.id)).toEqual(['h1']);
  });

  it('dans un calque verrouillé, le joueur touche encore son personnage', () => {
    const t = setupTokens({ tokens: [hero(), goblin()], characters: people(), viewer: ALICE });
    t.store.getState().upsert(
      'layers',
      [
        {
          ...t.store.getState().collections.layers!.get('personnages')!,
          locked: true,
          version: 2,
        },
      ],
      { force: true },
    );
    expect(t.engine.hitTest({ x: 200, y: 200 })?.id).toBe('h1');
    expect(t.engine.hitTest({ x: 500, y: 500 })).toBeNull();
  });
});

describe('sorte token : direct', () => {
  it('audience : public pour un joueur ou un PNJ visible, MJ pour un caché, certains joueurs sinon', () => {
    const t = setupTokens({
      tokens: [
        hero(),
        goblin(),
        token('g2', 'gobelin', { visibility: 'hidden' }),
        token('g3', 'gobelin', { visibility: 'invisible' }),
        token('g4', 'gobelin', { visibility: 'custom', visibleTo: ['hero'] }),
        token('g5', 'gobelin', { visibility: 'ally' }),
      ],
      characters: [
        ...people(),
        character('hero', { side: 'players', kind: 'pc', ownerId: 'alice', playedBy: 'bob' }),
      ],
    });
    expect(t.engine.liveAudience('h1')).toBe('public');
    expect(t.engine.liveAudience('g1')).toBe('public');
    expect(t.engine.liveAudience('g2')).toBe('gm');
    expect(t.engine.liveAudience('g3')).toBe('gm');
    expect(t.engine.liveAudience('g4')).toEqual({ users: ['alice', 'bob'] });
    expect(t.engine.liveAudience('g5')).toBe('public');
  });
});

describe('sorte token : supprimer, dupliquer', () => {
  it('Suppr sur un PNJ : confirmation, suppression avec le personnage, hors pile', async () => {
    const t = setupTokens({ tokens: [hero(), goblin()], characters: people() });
    const done = t.engine.deleteEntities([t.entity('g1')]);
    const confirm = t.engine.ui.getState().confirm!;
    expect(confirm.message).toContain('Gobelin');
    expect(confirm.danger).toBe(true);
    confirm.resolve(true);
    expect(await done).toBe(true);
    await t.commands.idle();
    expect(t.api.removeWithCharacter).toHaveBeenCalledWith('g1');
    expect(t.base.remove).not.toHaveBeenCalled();
    expect(t.data('g1')).toBeUndefined();
    // Définitif : rien à annuler
    expect(t.commands.getSnapshot().canUndo).toBe(false);
  });

  it('refus de la confirmation : rien ne part', async () => {
    const t = setupTokens({ tokens: [goblin()], characters: people() });
    const done = t.engine.deleteEntities([t.entity('g1')]);
    t.engine.ui.getState().confirm!.resolve(false);
    expect(await done).toBe(false);
    expect(t.api.removeWithCharacter).not.toHaveBeenCalled();
    expect(t.data('g1')).toBeDefined();
  });

  it('personnage joueur : retiré de la carte sans confirmation, annulable (recréé)', async () => {
    const t = setupTokens({ tokens: [hero()], characters: people() });
    expect(await t.engine.deleteEntities([t.entity('h1')])).toBe(true);
    expect(t.engine.ui.getState().confirm).toBeNull();
    expect(t.base.remove).toHaveBeenCalledTimes(1);
    expect(t.data('h1')).toBeUndefined();
    await t.commands.undo();
    await t.commands.idle();
    expect(t.base.create).toHaveBeenCalledTimes(1);
    expect(t.all().map((x) => x.characterId)).toEqual(['hero']);
  });

  it('refus du serveur pour un PNJ : il revient, message clair', async () => {
    const t = setupTokens({ tokens: [goblin()], characters: people() });
    t.api.removeWithCharacter.mockRejectedValueOnce(new Error('panne'));
    const done = t.engine.deleteEntities([t.entity('g1')]);
    t.engine.ui.getState().confirm!.resolve(true);
    expect(await done).toBe(false);
    expect(t.data('g1')).toBeDefined();
    expect(t.notify).toHaveBeenCalled();
  });

  it('Dupliquer un PNJ : /duplicate, copie sélectionnée ; annuler supprime la copie avec son personnage', async () => {
    const t = setupTokens({ tokens: [goblin()], characters: people() });
    t.engine.duplicateEntities([t.entity('g1')]);
    await t.commands.idle();
    expect(t.api.duplicate).toHaveBeenCalledWith('g1', { pos: { x: 550, y: 550 }, count: 1 });
    const copy = t.all().find((x) => x.id !== 'g1')!;
    expect(copy.id).toMatch(/^srv-/);
    expect(t.engine.selection.ids).toEqual([copy.id]);
    await t.commands.undo();
    await t.commands.idle();
    expect(t.api.removeWithCharacter).toHaveBeenCalledWith(copy.id);
    expect(t.all().map((x) => x.id)).toEqual(['g1']);
  });

  it('un personnage joueur ne se duplique pas', () => {
    const t = setupTokens({ tokens: [hero()], characters: people() });
    expect(t.engine.duplicateEntities([t.entity('h1')])).toBeNull();
    expect(t.api.duplicate).not.toHaveBeenCalled();
  });
});

describe('sorte token : annuaire', () => {
  it('un personnage modifié redessine ses tokens, et eux seuls', () => {
    const t = setupTokens({ tokens: [hero(), goblin()], characters: people() });
    const calls: string[] = [];
    const kind = t.kind();
    const original = t.engine.setEntityState.bind(t.engine);
    t.engine.setEntityState = (entities, patch) => {
      calls.push(...entities.map((e) => e.id));
      original(entities, patch);
    };
    t.tokens.directory.replace(people());
    expect(calls).toEqual([]);
    t.tokens.directory.replace([
      people()[0]!,
      character('gobelin', {
        name: 'Gobelin',
        resource: { key: 'PV', label: 'PV', value: 3, max: 7, color: null, rising: false },
      }),
    ]);
    expect(calls).toEqual(['g1']);
    expect(kind.name?.(t.data('g1')!, t.engine.kindContext())).toBe('Gobelin');
  });
});
