import { describe, expect, it } from 'vitest';
import { SELECT_TOOL_ID } from '../../engine/tools/tool-manager';
import { snapPlacement } from './placement';
import type { PlacementSource } from './state';
import { ALICE, character, setupTokens, token } from './test-kit';

const goblins: PlacementSource = {
  key: 'template:gob',
  name: 'Gobelin',
  imageUrl: 'https://img/gob.png',
  source: { templateId: '0190a3b4-0000-7000-8000-000000000001' },
};

/** Promesse du service tenue à la main (pour voir les fantômes pendant la pose). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('outil de pose : machine à états', () => {
  it('idle → armed → placing → idle, un seul appel pour N exemplaires', async () => {
    const t = setupTokens();
    const tool = t.activateTool();
    expect(tool.state).toBe('idle');
    t.tokens.library.setState({ count: 4, side: 'allies', visibility: 'hidden' });
    tool.arm(goblins);
    expect(tool.state).toBe('armed');
    expect(tool.cursor(t.engine)).toBe('copy');

    const reply = deferred<Awaited<ReturnType<typeof t.api.place>>>();
    const real = t.api.place.getMockImplementation()!;
    t.api.place.mockImplementationOnce(async (body) => {
      const r = await real(body);
      await reply.promise;
      return r;
    });
    t.click({ x: 510, y: 490 });
    expect(tool.state).toBe('placing');
    // Fantômes : 4 brouillons en grille, aimantés, au nom du modèle
    const drafts = t.all();
    expect(drafts).toHaveLength(4);
    expect(drafts.every((d) => d.draft?.side === 'allies' && d.visibility === 'hidden')).toBe(true);
    expect(drafts.map((d) => d.draft?.name)).toEqual([
      'Gobelin',
      'Gobelin 2',
      'Gobelin 3',
      'Gobelin 4',
    ]);
    expect(drafts.map((d) => d.pos)).toEqual([
      { x: 475, y: 475 },
      { x: 525, y: 475 },
      { x: 475, y: 525 },
      { x: 525, y: 525 },
    ]);
    expect(t.engine.selection.ids).toEqual(drafts.map((d) => d.id));
    // Un clic pendant la pose ne pose rien de plus
    t.click({ x: 100, y: 100 });
    expect(t.all()).toHaveLength(4);

    reply.resolve(undefined as never);
    await t.commands.idle();
    await Promise.resolve();
    expect(tool.state).toBe('idle');
    expect(t.api.place).toHaveBeenCalledTimes(1);
    expect(t.api.place).toHaveBeenCalledWith({
      source: goblins.source,
      count: 4,
      pos: { x: 500, y: 500 },
      side: 'allies',
      visibility: 'hidden',
      shape: 'circle',
      layerId: 'personnages',
    });
    // Les tokens du serveur remplacent les brouillons ; la sélection les suit
    const placed = t.all();
    expect(placed.map((p) => p.id)).toEqual(['srv-1', 'srv-2', 'srv-3', 'srv-4']);
    expect(placed.some((p) => p.draft)).toBe(false);
    expect(t.engine.selection.ids).toEqual(['srv-1', 'srv-2', 'srv-3', 'srv-4']);
  });

  it('⇧ au clic : la carte reste armée pour en poser d’autres', async () => {
    const t = setupTokens();
    const tool = t.activateTool();
    tool.arm(goblins);
    t.click({ x: 300, y: 300 }, { shift: true });
    await t.commands.idle();
    await Promise.resolve();
    expect(tool.state).toBe('armed');
    t.click({ x: 600, y: 600 });
    await t.commands.idle();
    await Promise.resolve();
    expect(tool.state).toBe('idle');
    expect(t.api.place).toHaveBeenCalledTimes(2);
  });

  it('Échap désarme, puis revient à la sélection ; rien n’est écrit', () => {
    const t = setupTokens();
    const tool = t.activateTool();
    tool.arm(goblins);
    t.engine.controller.keyDown(t.key('Escape', { key: 'Escape' }));
    expect(tool.state).toBe('idle');
    expect(t.engine.tools.getActiveId()).toBe('tokens');
    t.engine.controller.keyDown(t.key('Escape', { key: 'Escape' }));
    expect(t.engine.tools.getActiveId()).toBe(SELECT_TOOL_ID);
    expect(t.api.place).not.toHaveBeenCalled();
    expect(t.all()).toEqual([]);
  });

  it('quitter l’outil désarme la bibliothèque', () => {
    const t = setupTokens();
    const tool = t.activateTool();
    tool.arm(goblins);
    t.engine.tools.activate(SELECT_TOOL_ID);
    expect(t.tokens.library.getState().armed).toBeNull();
  });

  it('chiffres : nombre d’exemplaires pendant qu’une carte est armée (0 : 10)', () => {
    const t = setupTokens();
    const tool = t.activateTool();
    t.engine.controller.keyDown(t.key('Digit3', { key: '3' }));
    expect(t.tokens.library.getState().count).toBe(1);
    tool.arm(goblins);
    t.engine.controller.keyDown(t.key('Digit3', { key: '3' }));
    expect(t.tokens.library.getState().count).toBe(3);
    t.engine.controller.keyDown(t.key('Digit0', { key: '0' }));
    expect(t.tokens.library.getState().count).toBe(10);
  });

  it('sans carte armée, l’outil sélectionne et déplace comme la sélection', async () => {
    const t = setupTokens({
      tokens: [token('g1', 'gobelin', { pos: { x: 500, y: 500 } })],
      characters: [character('gobelin')],
    });
    t.activateTool();
    t.drag({ x: 500, y: 500 }, { x: 600, y: 500 });
    await t.commands.idle();
    expect(t.engine.selection.ids).toEqual(['g1']);
    expect(t.data('g1')!.pos).toEqual({ x: 625, y: 525 });
  });

  it('échec de la pose : les fantômes disparaissent, message clair, retour à idle', async () => {
    const t = setupTokens();
    const tool = t.activateTool();
    t.api.place.mockRejectedValueOnce(new Error('panne'));
    tool.arm(goblins);
    t.click({ x: 300, y: 300 });
    expect(t.all()).toHaveLength(1);
    await t.commands.idle();
    await Promise.resolve();
    expect(t.all()).toEqual([]);
    expect(t.notify).toHaveBeenCalled();
    expect(tool.state).toBe('idle');
  });

  it('glisser depuis la bibliothèque : le dépôt pose au point du monde', async () => {
    const t = setupTokens();
    const tool = t.activateTool();
    tool.hoverAt({ x: 200, y: 200 }, t.engine);
    expect(tool.hover).toEqual({ x: 200, y: 200 });
    await tool.dropAt(goblins, { x: 210, y: 190 });
    await t.commands.idle();
    expect(t.api.place).toHaveBeenCalledWith(
      expect.objectContaining({ pos: { x: 225, y: 175 }, count: 1 }),
    );
    expect(t.tokens.library.getState().armed).toBeNull();
    // Alt : sans aimantation
    await tool.dropAt(goblins, { x: 210, y: 190 }, { free: true });
    expect(t.api.place).toHaveBeenLastCalledWith(
      expect.objectContaining({ pos: { x: 210, y: 190 } }),
    );
  });

  it('annuler une pose supprime les PNJ créés avec leur personnage ; refaire les recrée', async () => {
    const t = setupTokens();
    const tool = t.activateTool();
    t.tokens.library.setState({ count: 2 });
    tool.arm(goblins);
    t.click({ x: 500, y: 500 });
    await t.commands.idle();
    expect(t.all().map((x) => x.id)).toEqual(['srv-1', 'srv-2']);
    expect(t.commands.getSnapshot().undoLabel).toBe('Poser 2 × Gobelin');
    await t.commands.undo();
    await t.commands.idle();
    expect(t.api.removeWithCharacter.mock.calls.map((c) => c[0])).toEqual(['srv-1', 'srv-2']);
    expect(t.all()).toEqual([]);
    await t.commands.redo();
    await t.commands.idle();
    expect(t.api.place).toHaveBeenCalledTimes(2);
    expect(t.all().map((x) => x.id)).toEqual(['srv-3', 'srv-4']);
  });

  it('pose dans le calque actif s’il y en a un (fantômes compris), sinon « Personnages »', async () => {
    const t = setupTokens();
    t.store.getState().upsert('layers', [
      {
        id: 'sol',
        version: 1,
        name: 'Sol',
        sortOrder: 1,
        visibleToPlayers: true,
        locked: false,
        opacity: 1,
        role: 'ground',
      },
    ]);
    t.engine.setActiveLayer('sol');
    const tool = t.activateTool();
    tool.arm(goblins);
    t.click({ x: 300, y: 300 });
    expect(t.all().map((d) => d.layerId)).toEqual(['sol']);
    await t.commands.idle();
    expect(t.api.place).toHaveBeenLastCalledWith(expect.objectContaining({ layerId: 'sol' }));
    // Plus de calque actif : celui des tokens
    t.engine.setActiveLayer(null);
    tool.arm(goblins);
    t.click({ x: 600, y: 600 });
    await t.commands.idle();
    expect(t.api.place).toHaveBeenLastCalledWith(
      expect.objectContaining({ layerId: 'personnages' }),
    );
  });

  it('réservé au MJ', () => {
    const t = setupTokens({ viewer: ALICE });
    expect(t.engine.tools.activate('tokens')).toBe(false);
  });
});

describe('aimantation de la pose', () => {
  const ctx = { pixelsPerUnit: 50, tokenScale: 1 };
  it('le premier exemplaire tombe au centre d’une case', () => {
    expect(snapPlacement({ x: 510, y: 490 }, 1, ctx, { size: 50 })).toEqual({ x: 525, y: 475 });
    // 4 exemplaires : le premier (en haut à gauche) au centre d'une case
    expect(snapPlacement({ x: 510, y: 490 }, 4, ctx, { size: 50 })).toEqual({ x: 500, y: 500 });
    expect(snapPlacement({ x: 510, y: 490 }, 4, ctx, null)).toEqual({ x: 510, y: 490 });
  });
});
