import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import {
  CLOSED,
  isMinimized,
  menuStage,
  reduceAttackFlow,
  type AttackFlowEvent,
  type AttackFlowState,
  type AttackMenuRequest,
} from '@/lib/combat/attack-flow';
import type { MenuItem, MapViewer } from '../../engine/entities/entity-kind';
import { SELECT_TOOL_ID } from '../../engine/tools/tool-manager';
import { ALICE, character, setupTokens, SPECTATOR, token } from '../tokens/test-kit';
import { AIM_TOOL_ID } from './aim-tool';
import { aimLines, defeatedOf, EMPTY_COMBAT_MAP, ringTargets } from './model';
import { combatModuleOf, registerCombat, type AttackMenuPort } from './register';

/** Menu d'attaque de test : la vraie machine, dans un magasin à part. */
function fakeMenu() {
  const store = createStore<{ flow: AttackFlowState }>()(() => ({ flow: CLOSED }));
  const opened: AttackMenuRequest[] = [];
  const port: AttackMenuPort = {
    getState: () => store.getState(),
    subscribe: (l) => store.subscribe(l),
    dispatch: (e: AttackFlowEvent) =>
      store.setState({ flow: reduceAttackFlow(store.getState().flow, e) }),
    open: (request) => {
      opened.push(request);
      port.dispatch({ type: 'open', request });
    },
  };
  return { port, store, opened, flow: () => store.getState().flow };
}

const people = () => [
  character('hero', { name: 'Aria', side: 'players', kind: 'pc', ownerId: 'alice' }),
  character('gobelin', { name: 'Gobelin' }),
  character('loup', { name: 'Loup' }),
];

function setup(viewer?: MapViewer) {
  const t = setupTokens({
    tokens: [
      token('h1', 'hero', { pos: { x: 200, y: 200 } }),
      token('g1', 'gobelin', { pos: { x: 500, y: 500 } }),
      token('l1', 'loup', { pos: { x: 700, y: 700 } }),
    ],
    characters: people(),
    ...(viewer ? { viewer } : {}),
  });
  const menu = fakeMenu();
  const cleanup = registerCombat(t.engine, {}, menu.port);
  const items = (...ids: string[]) => {
    t.engine.selection.replace(ids);
    return t.engine.menuItems(ids, { x: 0, y: 0 });
  };
  return { ...t, menu, cleanup, items };
}

const find = (items: readonly MenuItem[], id: string) => items.find((i) => i.id === id);
const tick = () => new Promise<void>((r) => queueMicrotask(r));

describe('entrées « Attaquer » de la carte', () => {
  it('MJ, un PNJ : « Attaquer » (cible) et « Attaquer avec » (attaquant)', () => {
    const t = setup();
    const items = t.items('g1');
    const attack = find(items, 'combat:attack')!;
    expect(attack).toMatchObject({ label: 'Attaquer', primary: true });
    attack.run!();
    expect(t.menu.opened.at(-1)).toEqual({
      campaignId: 'campagne',
      origin: 'map',
      targetIds: ['gobelin'],
    });
    find(items, 'combat:attack-with')!.run!();
    expect(t.menu.opened.at(-1)).toMatchObject({ origin: 'map', attackerId: 'gobelin' });
    const flow = t.menu.flow();
    expect(flow.phase === 'compose' && flow.draft.attackerId).toBe('gobelin');
  });

  it('MJ, plusieurs tokens : cibles de la sélection, ou PNJ à la suite', () => {
    const t = setup();
    const items = t.items('g1', 'l1');
    expect(find(items, 'combat:attack')!.label).toBe('Attaquer (2)');
    find(items, 'combat:attack-with-selection')!.run!();
    const flow = t.menu.flow();
    expect(flow.phase === 'compose' && flow.draft.attackerId).toBe('gobelin');
    expect(flow.phase === 'compose' && flow.queue).toEqual(['loup']);
  });

  it('joueur : « Attaquer » dans sa barre sur un token qui n’est pas à lui', () => {
    const t = setup(ALICE);
    const enemy = find(t.items('g1'), 'combat:attack')!;
    expect(enemy).toMatchObject({ forPlayers: true, primary: true });
    expect(find(t.items('g1'), 'combat:attack-with')).toBeUndefined();
    // Son propre token : au clic droit seulement (se viser reste possible)
    const own = find(t.items('h1'), 'combat:attack')!;
    expect(own).toMatchObject({ forPlayers: false, primary: false });
  });

  it('spectateur : rien', () => {
    const t = setup(SPECTATOR);
    expect(find(t.items('g1'), 'combat:attack')).toBeUndefined();
  });

  it('touche Y : la sélection devient les cibles', () => {
    const t = setup();
    t.engine.selection.replace(['g1', 'l1']);
    t.engine.shortcutFor('KeyY')!.run();
    expect(t.menu.opened.at(-1)).toMatchObject({
      origin: 'selection',
      targetIds: ['gobelin', 'loup'],
    });
  });
});

describe('outil de visée', () => {
  function aiming() {
    const t = setup();
    t.menu.port.open({ campaignId: 'campagne', origin: 'map', attackerId: 'hero' });
    t.menu.port.dispatch({ type: 'aim', on: true });
    return t;
  }

  it('suit le menu : « Viser sur la carte » prend l’outil, un clic vise et rend la main', async () => {
    const t = aiming();
    expect(t.engine.tools.getActiveId()).toBe(AIM_TOOL_ID);
    t.click({ x: 500, y: 500 });
    let flow = t.menu.flow();
    expect(flow.phase === 'compose' && flow.draft.targetIds).toEqual(['gobelin']);
    // Sans ⇧ : la visée est finie, la sélection n'a pas changé
    expect(t.engine.tools.getActiveId()).toBe(SELECT_TOOL_ID);
    await tick();
    flow = t.menu.flow();
    expect(flow.phase === 'compose' && flow.aiming).toBe(false);
    expect(t.engine.selection.ids).toEqual([]);
  });

  it('⇧ : plusieurs cibles ; un second clic retire ; le vide ne vise rien', () => {
    const t = aiming();
    t.click({ x: 500, y: 500 }, { shift: true });
    t.click({ x: 700, y: 700 }, { shift: true });
    t.click({ x: 500, y: 500 }, { shift: true });
    t.click({ x: 900, y: 100 }, { shift: true });
    const flow = t.menu.flow();
    expect(flow.phase === 'compose' && flow.draft.targetIds).toEqual(['loup']);
    expect(t.engine.tools.getActiveId()).toBe(AIM_TOOL_ID);
  });

  it('Échap termine la visée, cibles gardées', async () => {
    const t = aiming();
    t.click({ x: 500, y: 500 }, { shift: true });
    t.engine.controller.keyDown(t.key('Escape', { key: 'Escape' }));
    expect(t.engine.tools.getActiveId()).toBe(SELECT_TOOL_ID);
    await tick();
    const flow = t.menu.flow();
    expect(flow.phase === 'compose' && flow.aiming).toBe(false);
    expect(flow.phase === 'compose' && flow.draft.targetIds).toEqual(['gobelin']);
  });

  it('pastille : menu réduit pendant la visée, « Valider » le rouvre à l’étape « Préparer »', () => {
    const t = setup();
    t.menu.port.open({ campaignId: 'campagne', origin: 'map', attackerId: 'hero' });
    t.menu.port.dispatch({ type: 'chooseAction', actionId: 'frappe' });
    t.menu.port.dispatch({ type: 'aim', on: true });
    expect(isMinimized(t.menu.flow())).toBe(true);
    t.click({ x: 500, y: 500 }, { shift: true });
    t.click({ x: 700, y: 700 }, { shift: true });
    // Toujours réduit : les clics ⇧ ajoutent sans rouvrir
    expect(isMinimized(t.menu.flow())).toBe(true);
    t.menu.port.dispatch({ type: 'aim', on: false });
    const flow = t.menu.flow();
    expect(isMinimized(flow)).toBe(false);
    expect(t.engine.tools.getActiveId()).toBe(SELECT_TOOL_ID);
    expect(menuStage(flow, { actionCount: 3, revealed: false })).toBe('prepare');
    expect(flow.phase === 'compose' && flow.draft.targetIds).toEqual(['gobelin', 'loup']);
  });

  it('menu fermé pendant la visée : l’outil rend la main', () => {
    const t = aiming();
    t.menu.port.dispatch({ type: 'close' });
    expect(t.engine.tools.getActiveId()).toBe(SELECT_TOOL_ID);
  });

  it('démontage de la carte : la visée s’arrête, le menu reste ouvert', () => {
    const t = aiming();
    t.cleanup();
    const flow = t.menu.flow();
    expect(flow.phase).toBe('compose');
    expect(flow.phase === 'compose' && flow.aiming).toBe(false);
    expect(combatModuleOf(t.engine)).toBeNull();
  });
});

describe('anneaux et traits', () => {
  it('cibles : attaques ouvertes et brouillon, sans doublon', () => {
    const state = { ...EMPTY_COMBAT_MAP, openTargetIds: ['gobelin', 'loup'] };
    expect([...ringTargets(state, ['loup', 'hero'])]).toEqual(['gobelin', 'loup', 'hero']);
  });

  it('traits : visées reçues (MJ) puis la mienne, sans visée vide', () => {
    const state = {
      ...EMPTY_COMBAT_MAP,
      aims: [
        { attackerId: 'hero', targetIds: ['gobelin'] },
        { attackerId: 'brom', targetIds: [] },
      ],
    };
    expect(aimLines(state, { attackerId: 'loup', targetIds: ['hero'] })).toEqual([
      { attackerId: 'hero', targetIds: ['gobelin'] },
      { attackerId: 'loup', targetIds: ['hero'] },
    ]);
    expect(aimLines(state, { attackerId: 'loup', targetIds: [] })).toHaveLength(1);
  });

  it('l’état du module est exposé aux surcouches React', () => {
    const t = setup();
    combatModuleOf(t.engine)!.state.setState({ turnCharacterId: 'gobelin' });
    expect(combatModuleOf(t.engine)!.state.getState().turnCharacterId).toBe('gobelin');
  });
});

describe('hors de combat sur la carte', () => {
  it('grise les participants tombés que je vois, rien d’autre', () => {
    const p = (characterId: string, defeated?: boolean) => ({
      characterId,
      side: 'enemies' as const,
      sortKeys: [],
      hasActed: false,
      ...(defeated !== undefined ? { defeated } : {}),
    });
    expect(defeatedOf({ order: [p('gobelin', true), p('loup', false), p('orc')] })).toEqual([
      'gobelin',
    ]);
    expect(defeatedOf(null)).toEqual([]);
  });
});
